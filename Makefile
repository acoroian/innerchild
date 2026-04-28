# aiFamily — V1 infra commands.
#
# Per the deepened plan (simplicity review): we use a thin gcloud Makefile
# instead of Pulumi for V1. Once the ops surface justifies it, this gets
# replaced with the aerohub-style Pulumi stack.
#
# Required env (loaded from .env via direnv or `set -a; source .env; set +a`):
#   GCP_PROJECT, GCP_REGION, ARTIFACT_REPO, WORKER_SA, TASKS_INVOKER_SA,
#   SCHEDULER_INVOKER_SA, TASKS_QUEUE, WORKER_URL

PROJECT ?= $(GCP_PROJECT)
REGION  ?= $(GCP_REGION)
SERVICE ?= aifamily-worker
IMAGE   ?= $(REGION)-docker.pkg.dev/$(PROJECT)/$(ARTIFACT_REPO)/worker

.PHONY: help
help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-22s %s\n", $$1, $$2}'

# ── Project bootstrap ────────────────────────────────────────────────────────

.PHONY: gcp-bootstrap
gcp-bootstrap: ## One-time GCP project + APIs + service accounts setup
	gcloud config set project $(PROJECT)
	gcloud services enable \
	  run.googleapis.com \
	  cloudtasks.googleapis.com \
	  cloudscheduler.googleapis.com \
	  artifactregistry.googleapis.com \
	  secretmanager.googleapis.com \
	  iamcredentials.googleapis.com
	gcloud artifacts repositories create $(ARTIFACT_REPO) \
	  --repository-format=docker --location=$(REGION) || true
	gcloud iam service-accounts create aifamily-worker \
	  --display-name="aiFamily Cloud Run Worker" || true
	gcloud iam service-accounts create aifamily-tasks-invoker \
	  --display-name="aiFamily Cloud Tasks Invoker" || true
	gcloud iam service-accounts create aifamily-scheduler-invoker \
	  --display-name="aiFamily Cloud Scheduler Invoker" || true
	gcloud iam service-accounts create aifamily-github-actions \
	  --display-name="aiFamily GitHub Actions CI/CD" || true

.PHONY: tasks-queue
tasks-queue: ## Create the Cloud Tasks queue with retry policy
	gcloud tasks queues create aifamily-jobs --location=$(REGION) \
	  --max-attempts=5 \
	  --max-retry-duration=3600s \
	  --min-backoff=30s \
	  --max-backoff=300s \
	  --max-doublings=3 \
	  --max-concurrent-dispatches=20 \
	  --max-dispatches-per-second=5 || \
	gcloud tasks queues update aifamily-jobs --location=$(REGION) \
	  --max-attempts=5 --max-retry-duration=3600s \
	  --min-backoff=30s --max-backoff=300s --max-doublings=3 \
	  --max-concurrent-dispatches=20 --max-dispatches-per-second=5

# ── Worker build + deploy ────────────────────────────────────────────────────

.PHONY: worker-build
worker-build: ## Build the worker Docker image locally
	docker build -f worker/Dockerfile -t $(IMAGE):latest .

.PHONY: worker-push
worker-push: worker-build ## Push the worker image to Artifact Registry
	docker push $(IMAGE):latest

.PHONY: worker-deploy
worker-deploy: ## Deploy the worker to Cloud Run (gen2, concurrency=1)
	gcloud run deploy $(SERVICE) \
	  --image=$(IMAGE):latest \
	  --region=$(REGION) \
	  --project=$(PROJECT) \
	  --execution-environment=gen2 \
	  --service-account=$(WORKER_SA) \
	  --ingress=internal \
	  --concurrency=1 \
	  --cpu=2 --memory=2Gi \
	  --timeout=900 \
	  --min-instances=1 \
	  --max-instances=10 \
	  --set-secrets=WORKER_SHARED_SECRET=worker-shared-secret:latest

.PHONY: worker-grant-tasks-invoker
worker-grant-tasks-invoker: ## Allow Cloud Tasks SA to invoke the worker
	gcloud run services add-iam-policy-binding $(SERVICE) \
	  --member=serviceAccount:$(TASKS_INVOKER_SA) \
	  --role=roles/run.invoker \
	  --region=$(REGION) --project=$(PROJECT)

# ── Local dev ────────────────────────────────────────────────────────────────

.PHONY: dev
dev: ## Run Remix dev server locally
	npm run dev

.PHONY: worker-dev
worker-dev: ## Run worker locally (in-process; no Cloud Tasks)
	npm run worker:dev

.PHONY: db-push
db-push: ## Apply Supabase migrations to the linked project
	supabase db push

.PHONY: test
test: ## Run unit tests (mocks; no vendor calls)
	npm run lint && npm run typecheck && npm test

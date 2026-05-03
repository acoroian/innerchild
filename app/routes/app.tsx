import { json, type LoaderFunctionArgs, type MetaFunction } from "@remix-run/node";
import { Form, Link, NavLink, Outlet, useLoaderData } from "@remix-run/react";

import { requireUser } from "~/lib/auth.server";

export const meta: MetaFunction = () => [{ title: "mosaicrise" }];

export async function loader({ request }: LoaderFunctionArgs) {
  const { user, responseHeaders } = await requireUser(request);
  return json(
    {
      email: user.email ?? "",
    },
    { headers: responseHeaders },
  );
}

export default function AppLayout() {
  const { email } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-sand-50">
      <header className="border-b border-dusk-700/10 bg-sand-50">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4 sm:px-8">
          <Link to="/app" className="text-sm uppercase tracking-[0.18em] text-dusk-500 hover:text-dusk-700">
            mosaicrise
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <NavLink
              to="/app"
              end
              className={({ isActive }) =>
                isActive ? "text-dusk-900" : "text-dusk-500 hover:text-dusk-900"
              }
            >
              Subjects
            </NavLink>
            <span className="hidden text-dusk-400 sm:inline">·</span>
            <span className="hidden text-xs text-dusk-500 sm:inline">{email}</span>
            <Form method="post" action="/auth/signout">
              <button type="submit" className="text-sm text-dusk-500 hover:text-dusk-900">
                Sign out
              </button>
            </Form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12 sm:px-8">
        <Outlet />
      </main>
    </div>
  );
}

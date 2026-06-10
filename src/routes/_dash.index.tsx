import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_dash/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  return <Navigate to="/home" />;
}

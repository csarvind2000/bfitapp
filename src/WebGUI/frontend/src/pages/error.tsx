import { useRouteError, isRouteErrorResponse } from "react-router";

export default function ErrorPage() {
  const error = useRouteError();
  console.error("Uncaught exception", error);

  return (
    <div id="error-page">
      <h1>Oops!</h1>
      <p>
        Something unexpected has occurred. You may continue by refreshing the
        page or submit a bug report if this does not resolve the issue.
      </p>
      {isRouteErrorResponse(error) ? (
        <i>{error.statusText}</i>
      ) : (
        <i>{JSON.stringify(error)}</i>
      )}
    </div>
  );
}

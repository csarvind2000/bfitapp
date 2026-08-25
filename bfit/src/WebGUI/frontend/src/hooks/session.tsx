import * as React from "react";
import type { Session } from "@toolpad/core";

export interface AuthSessionResponse {
  user?: string;
  token?: string;
  date_joined?: string;
}

export interface SessionContextValue {
  session: Session | null;
  setSession: (session: Session | null) => void;
}

export const SessionContext = React.createContext<SessionContextValue>({
  session: {},
  setSession: () => {},
});

export function useSession() {
  return React.useContext(SessionContext);
}

export function formatAccountCreatedDate(dateJoined?: string) {
  if (!dateJoined) {
    return undefined;
  }

  const joinedDate = new Date(dateJoined);
  if (Number.isNaN(joinedDate.getTime())) {
    return undefined;
  }

  return `Created on ${new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(joinedDate)}`;
}

export function buildToolpadSession(authSession: AuthSessionResponse): Session {
  return {
    user: {
      name: authSession.user,
      email: formatAccountCreatedDate(authSession.date_joined),
    },
  };
}

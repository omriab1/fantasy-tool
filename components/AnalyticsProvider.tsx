"use client";

import { Analytics } from "@vercel/analytics/next";

export function AnalyticsProvider() {
  return (
    <Analytics
      beforeSend={(event) => {
        const url = new URL(event.url);
        if (url.pathname === "/") {
          url.pathname = "/homepage";
          return { ...event, url: url.toString() };
        }
        return event;
      }}
    />
  );
}

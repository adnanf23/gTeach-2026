"use client";

import React from "react";

const ICONS = {
  info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  // add more icons as needed
};

export default function Icon({ name, className = "h-4 w-4" }) {
  const path = ICONS[name];
  if (!path) return null;
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

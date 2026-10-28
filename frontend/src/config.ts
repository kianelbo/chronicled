export const APP_NAME = "Chronicled";
export const API_URL = "/api";

export const TOKEN_KEY = "chronicled.token";

// Mirrors the limits enforced in the backend validators.
export const LIMITS = {
  groupName: 32,
  title: 200,
  description: 20000,
  tags: 10,
  tag: 50,
} as const;

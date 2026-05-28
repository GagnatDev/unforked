import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { HttpError, errorHandler } from "./error.js";

function appThatThrows(err: unknown): express.Express {
  const app = express();
  app.get("/boom", () => {
    throw err;
  });
  app.use(errorHandler);
  return app;
}

describe("errorHandler", () => {
  it("maps an HttpError to its status and message", async () => {
    const res = await request(appThatThrows(new HttpError(404, "not found"))).get("/boom");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not found" });
  });

  it("maps an unexpected error to a generic 500 without leaking details", async () => {
    const res = await request(appThatThrows(new Error("kaboom"))).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });
  });
});

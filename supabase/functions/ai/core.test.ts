import { featureAdapter, parseRequest } from "./core.ts";

Deno.test("patient instructions require patient/consultation/revision and accept no caller context", () => {
  const body = { feature: "patient_instructions", idempotencyKey: "82f57ca2-2a4e-4c94-a2a4-000000000001",
    patientId: "82f57ca2-2a4e-4c94-a2a4-000000000002", consultationId: "82f57ca2-2a4e-4c94-a2a4-000000000003", revision: 1 };
  if (parseRequest(body).feature !== "patient_instructions" || !featureAdapter(body.feature, "patient_instructions@1")) throw new Error("missing instructions adapter");
  for (const unsafe of [{ ...body, narrative: "invented facts" }, { ...body, revision: undefined }, { ...body, patientId: undefined }]) {
    let rejected = false;
    try { parseRequest(unsafe); } catch { rejected = true; }
    if (!rejected) throw new Error("untrusted or incomplete source accepted");
  }
});

Deno.test("consultation objective assistance uses the clinical server context", () => {
  const request = parseRequest({
    feature: "consultation_support",
    idempotencyKey: "82f57ca2-2a4e-4c94-a2a4-000000000001",
    patientId: "82f57ca2-2a4e-4c94-a2a4-000000000002",
    consultationId: "82f57ca2-2a4e-4c94-a2a4-000000000003",
    revision: 2,
  });
  if (request.feature !== "consultation_support" || request.revision !== 2)
    throw new Error("clinical request was not parsed");
  const adapter = featureAdapter("consultation_support", "consultation_support@1");
  if (!adapter || !adapter.instructions.includes("evidenceFactIds"))
    throw new Error("versioned objective adapter was not loaded");
});

Deno.test("objective assistance rejects caller supplied narrative and missing consultation context", () => {
  for (const body of [
    {
      feature: "consultation_support",
      idempotencyKey: "82f57ca2-2a4e-4c94-a2a4-000000000001",
      patientId: "82f57ca2-2a4e-4c94-a2a4-000000000002",
      consultationId: "82f57ca2-2a4e-4c94-a2a4-000000000003",
      revision: 2,
      narrative: "caller-controlled context",
    },
    {
      feature: "consultation_support",
      idempotencyKey: "82f57ca2-2a4e-4c94-a2a4-000000000001",
      patientId: "82f57ca2-2a4e-4c94-a2a4-000000000002",
    },
  ]) {
    let rejected = false;
    try {
      parseRequest(body);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("unsafe objective request was accepted");
  }
});

import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecallNarrativeInput, type RecallSpeechRecognition } from "./RecallNarrativeInput";

const recognizer = () => FakeSpeech.instances.at(-1)!;
class FakeSpeech implements RecallSpeechRecognition {
  static instances: FakeSpeech[] = [];
  constructor() { FakeSpeech.instances.push(this); }
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: RecallSpeechRecognition["onresult"] = null;
  onerror: RecallSpeechRecognition["onerror"] = null;
  onend: RecallSpeechRecognition["onend"] = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();
}
function Harness() {
  const [value, setValue] = useState("Desayuno:");
  const [listening, setListening] = useState(false);
  return <><RecallNarrativeInput value={value} onChange={setValue} disabled={false} onListeningChange={setListening} />
    <output aria-label="Texto definitivo">{value}</output><button disabled={listening}>Guardar</button></>;
}
beforeEach(() => { vi.stubGlobal("SpeechRecognition", FakeSpeech); vi.stubGlobal("webkitSpeechRecognition", undefined); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows interim speech, appends final speech once and lets the clinician edit after stopping", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Dictar recordatorio" }));
  expect(recognizer().lang).toBe("es-MX");
  expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  act(() => recognizer().onresult?.({ results: [{ isFinal: false, 0: { transcript: "dos" } }] }));
  expect(screen.getByLabelText("Texto capturado")).toHaveValue("Desayuno: dos");
  expect(screen.getByLabelText("Texto definitivo")).toHaveTextContent(/^Desayuno:$/);
  for (let n = 0; n < 2; n++) act(() => recognizer().onresult?.({ results: [{ isFinal: true, 0: { transcript: "dos huevos" } }] }));
  fireEvent.click(screen.getByRole("button", { name: "Detener dictado" }));
  expect(screen.getByLabelText("Texto capturado")).toHaveValue("Desayuno: dos huevos");
  fireEvent.change(screen.getByLabelText("Texto capturado"), { target: { value: "Un huevo" } });
  expect(screen.getByLabelText("Texto definitivo")).toHaveTextContent("Un huevo");
});

it("keeps manual input available when speech is unsupported or permission is denied", () => {
  vi.stubGlobal("SpeechRecognition", undefined);
  const view = render(<Harness />);
  expect(screen.getByRole("button", { name: "Dictar recordatorio" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Texto capturado"), { target: { value: "Fruta" } });
  expect(screen.getByLabelText("Texto definitivo")).toHaveTextContent("Fruta");
  view.unmount();
  vi.stubGlobal("SpeechRecognition", FakeSpeech);
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Dictar recordatorio" }));
  act(() => recognizer().onerror?.({ error: "not-allowed" }));
  expect(screen.getByText(/No se autorizó el micrófono/)).toBeVisible();
  expect(screen.getByLabelText("Texto capturado")).toHaveValue("Desayuno:");
  expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
});

it("stops listening when the section unmounts and ignores late transcripts", () => {
  const changed = vi.fn();
  const view = render(<RecallNarrativeInput value="" onChange={changed} disabled={false} onListeningChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Dictar recordatorio" }));
  const late = recognizer().onresult;
  view.unmount();
  expect(recognizer().abort).toHaveBeenCalledOnce();
  act(() => late?.({ results: [{ isFinal: true, 0: { transcript: "tarde" } }] }));
  expect(changed).not.toHaveBeenCalled();
});

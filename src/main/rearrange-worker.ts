import { parentPort, workerData } from "node:worker_threads";
import { inspectRearrange } from "./pdf-engine/rearrange/inspect";
void inspectRearrange(workerData.location).then(
  (value) => parentPort!.postMessage({ ok: true, value }),
  () =>
    parentPort!.postMessage({
      ok: false,
      error:
        "This PDF can't be rearranged safely. It may be damaged or unsupported.",
    }),
);

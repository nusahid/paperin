import { AlertTriangle, FileOutput, Save } from "lucide-react";
import type { ExportPlan } from "../../../shared/types";
import { pageSummary } from "../../../shared/plans";
import { useApp } from "../store";
import { Modal } from "./Modal";
import { PdfPage } from "./PdfPage";
export function Preview({
  plan,
  onClose,
  onExport,
}: {
  plan: ExportPlan;
  onClose: () => void;
  onExport: (plan: ExportPlan) => void;
}) {
  const { documents } = useApp();
  const warnings = [
    ...new Set(
      plan.outputs.flatMap((o) =>
        o.sources.flatMap(
          (s) => documents.find((d) => d.id === s.id)?.warnings ?? [],
        ),
      ),
    ),
  ];
  return (
    <Modal title="A look before you save" onClose={onClose} wide>
      <p className="modal-description">
        {plan.outputs.length} PDF{plan.outputs.length > 1 ? "s" : ""}, arranged
        exactly as shown below.
      </p>
      <div className="preview-scroll">
        {plan.outputs.map((output, i) => (
          <section className="preview-output" key={i}>
            <div className="preview-file-heading">
              <FileOutput size={19} />
              <strong>{output.name}</strong>
              <span>
                {output.sources.reduce((n, s) => n + s.pages.length, 0)} pages
              </span>
            </div>
            {output.sources.map((source, s) => {
              const doc = documents.find((d) => d.id === source.id)!;
              return (
                <div className="preview-source" key={s}>
                  <p>
                    <strong>{doc.name}</strong>
                    <span>Pages {pageSummary(source.pages)}</span>
                  </p>
                  <div className="preview-thumbnails">
                    {source.pages.map((page, p) => (
                      <div className="preview-thumb" key={p}>
                        <PdfPage pdf={doc.pdf} page={page} width={72} />
                        <span>{page}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
      <div className="preview-warning">
        <AlertTriangle size={17} />
        <p>
          {warnings.length
            ? warnings.join(" ")
            : "Page operations may change bookmarks, forms, attachments, or digital signatures. Review important documents after export."}
        </p>
      </div>
      <div className="modal-actions">
        <button className="button secondary" onClick={onClose}>
          Keep editing
        </button>
        <button className="button primary" onClick={() => onExport(plan)}>
          <Save size={16} />
          Save {plan.outputs.length > 1 ? `${plan.outputs.length} PDFs` : "PDF"}
        </button>
      </div>
    </Modal>
  );
}

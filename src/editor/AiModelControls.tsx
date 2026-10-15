import { useEditorAi } from "../state/editorAi";

const effortLabels: Record<string, string> = { none: "Nessuno", minimal: "Minimo", low: "Basso", medium: "Medio", high: "Alto", xhigh: "Molto alto", max: "Massimo", ultra: "Ultra" };
export function AiModelControls({ prefix = "chat-ai" }: { prefix?: string }) {
  const ai = useEditorAi(), model = ai.models.find(item => item.id === ai.model), blocked = ai.busy || ai.checking || ai.connecting || !ai.account?.connected;
  return <div className="ai-model-controls">
    <label htmlFor={`${prefix}-model`}>Modello<select id={`${prefix}-model`} value={ai.model} disabled={blocked || !ai.models.length} onChange={event => ai.setModel(event.target.value)}>
      <option value="">Scegli un modello</option>{ai.model && !model && <option value={ai.model}>{ai.model}</option>}{ai.models.map(item => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}
    </select></label>
    <label htmlFor={`${prefix}-reasoning`}>Ragionamento<select id={`${prefix}-reasoning`} value={ai.reasoningEffort} disabled={blocked || !model?.supportedReasoningEfforts?.length} onChange={event => ai.setReasoningEffort(event.target.value)}>
      <option value="">Predefinito{model?.defaultReasoningEffort ? ` · ${effortLabels[model.defaultReasoningEffort] ?? model.defaultReasoningEffort}` : " del modello"}</option>{model?.supportedReasoningEfforts?.map(item => <option key={item.reasoningEffort} value={item.reasoningEffort} title={item.description}>{effortLabels[item.reasoningEffort] ?? item.reasoningEffort}</option>)}
    </select></label>
  </div>;
}

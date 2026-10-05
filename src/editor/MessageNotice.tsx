import { describeEditorMessage, type MessageContext } from "../core/editorMessages";

export function MessageNotice({ raw, context = "editor" }: { raw: string; context?: MessageContext }) {
  const message = describeEditorMessage(raw, context);
  return <div className="message-notice">
    <p>{message.text}</p>
    {message.nextStep && <p className="message-next-step">{message.nextStep}</p>}
    {message.details && <details className="message-details"><summary>Dettagli tecnici (per assistenza)</summary><pre>{message.details}</pre></details>}
  </div>;
}

export interface StudioChecklistItem {
  done: boolean;
  label: string;
  /** Optional items never block going live. */
  optional?: boolean;
}

/** Pre-flight items shown beside the Go live button. */
export function studioChecklist(input: {
  detailsReady: boolean;
  microphoneEnabled: boolean;
  previewReady: boolean;
}): StudioChecklistItem[] {
  return [
    { done: input.detailsReady, label: 'Title and description' },
    { done: input.previewReady, label: 'Video preview' },
    {
      done: input.microphoneEnabled,
      label: input.microphoneEnabled ? 'Microphone on' : 'Microphone off',
      optional: true,
    },
  ];
}

/** True when every required checklist item is done. */
export function studioReadyToStart(items: StudioChecklistItem[]): boolean {
  return items.every((item) => item.optional || item.done);
}

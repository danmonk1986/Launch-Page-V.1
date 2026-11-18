/**
 * V20-326 (COPY CP-006 to CP-011, Nov 18): one set of words for each feature, used on its tour slide AND when you
 * hover its card's title on the Launch Page (the hover swaps the card's contents for these words).
 */
export type FeatureKey = 'timed' | 'rockets' | 'routine' | 'tasks' | 'week' | 'logging';
export const FEATURE_COPY: Record<FeatureKey, { title: string; body: string }> = {
  timed: { title: "Focus on what's right in front of you.", body: 'Your tasks launch on time, with a pop-up that opens the tools you need. Start it, snooze it, or skip it intentionally.' },
  rockets: { title: 'Stop hunting for tabs.', body: 'One tap opens every link a block needs, so you start working, not searching.' },
  routine: { title: 'Every day has a shape.', body: "What's happening NOW sits on top, the rest of the day below. Days, nights or shifts, it flips with you." },
  tasks: { title: 'Know what matters today.', body: 'Due today and key tasks stay on top. Everything else waits its turn.' },
  week: { title: "See what's coming before it hits.", body: 'Every launch and task for the week, day by day.' },
  logging: { title: 'Proof, not feelings.', body: "Log how long each block really took, and your week shows if you're sticking to the plan." }
};

/**
 * V20-326 (COPY CP-006 to CP-011, Nov 18): one set of words for each feature, used on its tour slide AND when you
 * hover its card's title on the Launch Page (the hover swaps the card's contents for these words).
 */
export type FeatureKey = 'timed' | 'rockets' | 'routine' | 'tasks' | 'week' | 'logging';
// Nov 18: Dan's own words (COPY tab, rewritten by hand). Headlines in caps, as he wrote them.
export const FEATURE_COPY: Record<FeatureKey, { title: string; body: string }> = {
  timed: { title: "FOCUS ON WHAT'S RIGHT IN FRONT OF YOU", body: 'Set up your day. Launch your tasks on time with a pop-up that opens all the tools you need. Start it, snooze it, or skip it.' },
  rockets: { title: 'LIKE BOOKMARKS, BUT WAY BETTER', body: 'Rockets launch everything you need for a session with one simple tap. Start working on time, with no distractions.' },
  routine: { title: 'MAKE A PLAN, STICK TO IT!', body: "Schedule your day around your wake and sleep times. What's happening now sits at the top, so you focus on now." },
  tasks: { title: 'ONE TASK AT A TIME', body: "Don't let your to-do list help you procrastinate. Set three key tasks and see what's due today." },
  week: { title: "SEE WHAT'S COMING BEFORE IT HITS", body: 'Every launch and task for the week, day by day.' },
  logging: { title: 'BIG GOALS FROM SMALL VICTORIES', body: 'Log your progress, billable hours and milestones. Sticking to your plan? Prove it.' }
};

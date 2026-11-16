export type ChangeMode = 'BUILD' | 'BREAK';
export type Law = 'cue' | 'craving' | 'response' | 'reward' | 'foundation' | 'advanced';

export type Technique = {
  id: string;
  name: string;
  laws: Law[];
  modes: ChangeMode[];
  description: string;
  example: string;
};

export const lawGroups: { id: Law; build: string; break: string; prompt: string }[] = [
  { id: 'cue', build: 'Make it obvious', break: 'Make it invisible', prompt: 'Shape the cues you see and the ones you avoid.' },
  { id: 'craving', build: 'Make it attractive', break: 'Make it unattractive', prompt: 'Change how appealing the routine feels.' },
  { id: 'response', build: 'Make it easy', break: 'Make it difficult', prompt: 'Adjust the effort required and prepare a better next action.' },
  { id: 'reward', build: 'Make it satisfying', break: 'Make it unsatisfying', prompt: 'Shape what happens immediately after the behavior.' },
];

export const techniques: Technique[] = [
  { id: 'identity-votes', name: 'Two-Step Identity Change', laws: ['foundation'], modes: ['BUILD', 'BREAK'], description: 'Choose who you want to become, then use small actions as evidence.', example: 'Each time you pause before opening an app, you cast a vote for being more intentional.' },
  { id: 'pointing-calling', name: 'Pointing-and-Calling', laws: ['cue'], modes: ['BUILD', 'BREAK'], description: 'Name the action and its likely outcome out loud to bring an automatic routine into awareness.', example: 'Say, “I am reaching for my phone because I feel bored.”' },
  { id: 'habits-scorecard', name: 'Habits Scorecard', laws: ['foundation', 'cue'], modes: ['BUILD', 'BREAK'], description: 'List your daily routines and mark which support, work against, or are neutral to your goals.', example: 'Notice the first three things you do after waking up.' },
  { id: 'implementation-intentions', name: 'Implementation Intentions', laws: ['cue'], modes: ['BUILD', 'BREAK'], description: 'Decide in advance when and where you will act.', example: '“I will read at 9 PM in bed.” Or, “When I sit on the couch, I will leave my phone in the kitchen.”' },
  { id: 'habit-stacking', name: 'Habit Stacking', laws: ['cue', 'response'], modes: ['BUILD', 'BREAK'], description: 'Attach a new action to a routine that already happens.', example: '“After I pour coffee, I will write one sentence.”' },
  { id: 'environment-design', name: 'Environment Design', laws: ['cue'], modes: ['BUILD'], description: 'Arrange your surroundings so helpful cues are easy to notice.', example: 'Leave your book open where you usually sit.' },
  { id: 'reduce-exposure', name: 'Reduce Exposure to Cues', laws: ['cue'], modes: ['BREAK'], description: 'Remove, hide, or avoid the prompt that starts the unwanted routine.', example: 'Keep the phone outside the bedroom or remove a tempting app from the home screen.' },
  { id: 'temptation-bundling', name: 'Temptation Bundling', laws: ['craving', 'reward'], modes: ['BUILD'], description: 'Pair something you want with an action you want to do.', example: 'Listen to a favorite podcast only while you take a walk.' },
  { id: 'stacking-bundling', name: 'Habit Stacking Plus Temptation Bundling', laws: ['cue', 'craving'], modes: ['BUILD'], description: 'Connect an existing routine, a useful action, and an enjoyable action in sequence.', example: '“After coffee, I will stretch. After stretching, I will play my favorite song.”' },
  { id: 'group-norms', name: 'Imitate Group Norms', laws: ['craving'], modes: ['BUILD', 'BREAK'], description: 'Spend time with people for whom the behavior you want is normal.', example: 'Join a reading group or spend less time in a social setting that cues the routine you want to change.' },
  { id: 'motivation-ritual', name: 'Motivation Ritual', laws: ['craving', 'cue'], modes: ['BUILD'], description: 'Use a short, pleasant routine to shift into the behavior.', example: 'Take three breaths and put on the same focus playlist before writing.' },
  { id: 'reframe-mindset', name: 'Reframe Your Mindset', laws: ['craving'], modes: ['BREAK'], description: 'Notice the real benefits of changing the behavior and reframe the choice in your own words.', example: 'Replace “I am giving something up” with “I am choosing better sleep.”' },
  { id: 'reduce-friction', name: 'Reduce Friction', laws: ['response'], modes: ['BUILD'], description: 'Remove steps and effort between you and the action.', example: 'Keep your workout clothes beside the bed.' },
  { id: 'prime-environment', name: 'Prime the Environment', laws: ['cue', 'response'], modes: ['BUILD'], description: 'Prepare the space before the moment you need it.', example: 'Set out your notebook and pen before going to sleep.' },
  { id: 'decisive-moment', name: 'Master the Decisive Moment', laws: ['cue', 'response'], modes: ['BUILD', 'BREAK'], description: 'Plan for the small choice that determines what you do next.', example: 'Decide what you will do when you first sit down after work.' },
  { id: 'two-minute-rule', name: 'Two-Minute Rule', laws: ['response'], modes: ['BUILD'], description: 'Shrink the starting action until it takes two minutes or less.', example: 'Open the book and read one page.' },
  { id: 'habit-shaping', name: 'Habit Shaping', laws: ['response'], modes: ['BUILD'], description: 'Increase the challenge in small stages after the starter action feels familiar.', example: 'Build from one page to five minutes, then to a chapter.' },
  { id: 'habit-automation', name: 'Habit Automation', laws: ['cue', 'response'], modes: ['BUILD', 'BREAK'], description: 'Use tools or one-time choices to make future behavior more automatic.', example: 'Schedule a recurring transfer or use device settings to limit access to a distracting app.' },
  { id: 'increase-friction', name: 'Increase Friction', laws: ['response'], modes: ['BREAK'], description: 'Add steps or effort before the unwanted routine.', example: 'Log out after each session or store the device in another room.' },
  { id: 'commitment-device', name: 'Commitment Device', laws: ['response', 'reward'], modes: ['BUILD', 'BREAK'], description: 'Make a voluntary choice now that makes a future action easier or harder.', example: 'Use a blocker during focus time or arrange a class you have already paid to attend.' },
  { id: 'immediate-reinforcement', name: 'Immediate Reinforcement', laws: ['reward'], modes: ['BUILD'], description: 'Choose a small immediate reward that supports the behavior you want.', example: 'Enjoy a favorite tea after your writing session.' },
  { id: 'enjoy-restraint', name: 'Make Restraint Enjoyable', laws: ['reward'], modes: ['BREAK'], description: 'Make the benefit of skipping the old routine visible and rewarding.', example: 'Move the money you would have spent into a savings goal.' },
  { id: 'habit-tracking', name: 'Habit Tracking', laws: ['reward'], modes: ['BUILD', 'BREAK'], description: 'Keep a visible record of the actions you take.', example: 'Mark each day you use your replacement action or complete your new routine.' },
  { id: 'stacking-tracking', name: 'Habit Stacking Plus Habit Tracking', laws: ['cue', 'reward'], modes: ['BUILD', 'BREAK'], description: 'Attach recording your progress to the behavior itself.', example: '“After I finish my walk, I will mark it on my calendar.”' },
  { id: 'accountability-partner', name: 'Accountability Partner', laws: ['reward'], modes: ['BUILD', 'BREAK'], description: 'Invite someone you trust to check in on your progress, if that feels useful.', example: 'Send a weekly update to a friend. Sharing is optional.' },
  { id: 'habit-contract', name: 'Habit Contract', laws: ['reward'], modes: ['BUILD', 'BREAK'], description: 'Write down a voluntary agreement and any mutually agreed consequence.', example: 'Agree with a partner to check in once a week. Keep any stake safe and affordable.' },
  { id: 'activity-zones', name: 'One Space, One Use', laws: ['cue'], modes: ['BUILD', 'BREAK'], description: 'Give a space or device a clear primary purpose so its cues support the behavior you want.', example: 'Use your desk for study and keep entertainment on another device.' },
  { id: 'active-practice', name: 'Action vs. Motion', laws: ['response'], modes: ['BUILD'], description: 'Move from planning into a small repetition of the behavior itself.', example: 'Write one sentence instead of only researching writing advice.' },
  { id: 'paper-clips', name: 'Paper Clip Strategy', laws: ['reward'], modes: ['BUILD'], description: 'Move a physical marker after each repetition to make progress visible and satisfying.', example: 'Move one paper clip to a second jar after each sales call.' },
  { id: 'nonscale-victories', name: 'Nonscale Victories Tracking', laws: ['reward'], modes: ['BUILD'], description: 'Track meaningful signs of progress beyond a single primary number.', example: 'Notice better sleep or energy as you build an exercise routine.' },
  { id: 'explore-exploit', name: 'Explore and Exploit', laws: ['advanced'], modes: ['BUILD', 'BREAK'], description: 'Try different approaches, then spend more time on the ones that work for you.', example: 'Test two replacement routines this week and keep the more useful one.' },
  { id: 'goldilocks-rule', name: 'Goldilocks Rule', laws: ['advanced', 'craving', 'response'], modes: ['BUILD'], description: 'Choose a challenge that is engaging but still manageable.', example: 'Increase a walk from five minutes to ten when five feels comfortable.' },
  { id: 'reflection-review', name: 'Reflection and Review', laws: ['advanced'], modes: ['BUILD', 'BREAK'], description: 'Review your choices and routines periodically, then adjust your plan.', example: 'Look back each week at when urges appeared and which strategies helped.' },
  { id: 'decision-journal', name: 'Decision Journal', laws: ['advanced'], modes: ['BUILD', 'BREAK'], description: 'Record important choices, your reasoning, and what happened afterward.', example: 'Note the cue, the response you chose, and how you felt later.' },
  { id: 'annual-review', name: 'Annual Review', laws: ['advanced'], modes: ['BUILD', 'BREAK'], description: 'Look back over the year and notice what changed and what helped.', example: 'Review your habit notes and identify the strategies worth keeping.' },
  { id: 'integrity-report', name: 'Integrity Report', laws: ['advanced'], modes: ['BUILD', 'BREAK'], description: 'Check in with your values and whether your routines reflect them.', example: 'Ask which current routines feel aligned with the life you want.' },
];

export const techniqueMap = Object.fromEntries(techniques.map(item => [item.id, item]));

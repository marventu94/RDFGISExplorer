export interface TutorialStepOptions {
  id?: string;
  attachTo?: { element: string; on: string };
  text: string;
  title?: string;
  buttons?: Array<{
    text: string;
    action: () => void;
    secondary?: boolean;
  }>;
  when?: {
    show?: () => void;
    hide?: () => void;
  };
  canClickTarget?: boolean;
  scrollTo?: boolean | { behavior: string; block: string };
  arrow?: boolean;
}

export interface TutorialContext {
  simulateTyping(input: string, onDone: () => void): void;
  simulateSearchDrag(): void;
  simulatePropertyDrag(): void;
  toggleSparql(): void;
  continue(): void;
  back(): void;
  complete(): void;
}

export function buildSteps(ctx: TutorialContext): TutorialStepOptions[] {
  return [
    // Step 0 — Welcome
    {
      id: 'step-0',
      text: 'Hello! This tutorial will guide you in the usage of this interface.',
      buttons: [{ text: 'Next', action: () => ctx.continue() }],
    },
    // Step 1 — Search input
    {
      id: 'step-1',
      attachTo: { element: '#step1', on: 'bottom' },
      text: 'You can start searching <b style="color: #1f77b4;">resources</b> here',
      buttons: [
        { text: 'Back', action: () => ctx.back(), secondary: true },
        { text: 'Next', action: () => ctx.continue() },
      ],
    },
    // Step 2 — Search container with typing
    {
      id: 'step-2',
      attachTo: { element: '#search-container', on: 'bottom' },
      text: 'As example, let us search <i>Einstein</i>...',
      buttons: [
        { text: 'Back', action: () => ctx.back(), secondary: true },
        { text: 'Next', action: () => ctx.continue() },
      ],
      when: {
        show: () => {
          ctx.simulateTyping('Einstein', () => {
            const input = document.getElementById('search-input') as HTMLInputElement;
            if (input) {
              input.dispatchEvent(new Event('input', { bubbles: true }));
              setTimeout(() => {
                const form = document.getElementById('step1') as HTMLFormElement;
                form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
              }, 50);
            }
          });
        },
      },
    },
    // Step 3 — Search results
    {
      id: 'step-3',
      attachTo: { element: '#search-results-panel', on: 'right' },
      text: 'The search results are displayed here, each of these elements can be dragged...',
      buttons: [
        { text: 'Back', action: () => ctx.back(), secondary: true },
        { text: 'Next', action: () => ctx.continue() },
      ],
    },
    // Step 4 — Canvas (simulated drag)
    {
      id: 'step-4',
      attachTo: { element: '#vqb-main', on: 'left' },
      text: '... and dropped here, this space is the <i>query creator</i>.',
      buttons: [
        { text: 'Back', action: () => ctx.back(), secondary: true },
        { text: 'Next', action: () => ctx.continue() },
      ],
      when: {
        show: () => {
          ctx.simulateSearchDrag();
        },
      },
    },
    // Step 5 — Canvas (click resource)
    {
      id: 'step-5',
      attachTo: { element: '#vqb-main', on: 'left' },
      text: 'Clicking in a <b style="color: #1f77b4;">resource</b> here will open the explorer tool (&#9776;)',
      buttons: [
        { text: 'Back', action: () => ctx.back(), secondary: true },
        { text: 'Next', action: () => ctx.continue() },
      ],
    },
    // Step 6 — Right panel (explore)
    {
      id: 'step-6',
      attachTo: { element: '#right-panel', on: 'left' },
      text: 'Here you can explore the properties of this <b style="color: #1f77b4;">resource</b>, bordered elements can be dragged and dropped into the <i>query creator</i>.',
      buttons: [
        { text: 'Back', action: () => ctx.back(), secondary: true },
        { text: 'Next', action: () => ctx.continue() },
      ],
    },
    // Step 7 — Scroll to object properties
    {
      id: 'step-7',
      attachTo: { element: '#right-panel', on: 'left' },
      text: 'As an example let us drag some of these properties...',
      buttons: [
        { text: 'Back', action: () => ctx.back(), secondary: true },
        { text: 'Next', action: () => ctx.continue() },
      ],
      when: {
        show: () => {
          document.getElementById('objptitle')?.scrollIntoView({ behavior: 'smooth' });
        },
      },
    },
    // Step 8 — Simulated property drag
    {
      id: 'step-8',
      attachTo: { element: '#vqb-main', on: 'left' },
      text: '... into the <i>query creator</i>. When you drop a <b style="color: #ff7f0e;">property</b> a <b style="color: #2ca02c;">variable</b> will be created that will collect the desired information. <b style="color: #2ca02c;">Variables</b> always begin with a <b>?</b>.',
      buttons: [
        { text: 'Back', action: () => ctx.back(), secondary: true },
        { text: 'Next', action: () => ctx.continue() },
      ],
      when: {
        show: () => {
          document.getElementById('objptitle')?.scrollIntoView({ behavior: 'smooth' });
          ctx.simulatePropertyDrag();
        },
      },
    },
    // Step 9 — Click the new variable
    {
      id: 'step-9',
      attachTo: { element: '#vqb-main', on: 'left' },
      text: 'Clicking a <b style="color: #2ca02c;">variable</b> will open the edit tool (&#9998;).',
      buttons: [
        { text: 'Back', action: () => ctx.back(), secondary: true },
        { text: 'Next', action: () => ctx.continue() },
      ],
    },
    // Step 10 — Edit panel
    {
      id: 'step-10',
      attachTo: { element: '#right-panel', on: 'right' },
      text: 'Here you can change if this element is a <b style="color: #2ca02c;">variable</b> or a constraint (<b style="color: #1f77b4;">resource</b>). <b style="color: #2ca02c;">Variables</b> will display possible solutions so you can check what you are collecting.',
      buttons: [
        { text: 'Back', action: () => ctx.back(), secondary: true },
        { text: 'Next', action: () => ctx.continue() },
      ],
    },
    // Step 11 — Edit panel details
    {
      id: 'step-11',
      attachTo: { element: '#right-panel', on: 'right' },
      text: 'Next to each possible result there is a + symbol, clicking it will add that value as a constraint but will not set the <b style="color: #1f77b4;">resource</b> as one. To set this <b style="color: #1f77b4;">resource</b> as constraint (or as <b style="color: #2ca02c;">variable</b>) you should click on the tabs above.',
      buttons: [
        { text: 'Back', action: () => ctx.back(), secondary: true },
        { text: 'Next', action: () => ctx.continue() },
      ],
    },
    // Step 12 — Tools bar
    {
      id: 'step-12',
      attachTo: { element: '#right-buttons', on: 'left' },
      text: 'More tools are displayed here. You can switch tools at any time. Let us check the <i>query</i> tool (&lt;/&gt;)',
      buttons: [
        { text: 'Back', action: () => ctx.back(), secondary: true },
        { text: 'Next', action: () => ctx.continue() },
      ],
    },
    // Step 13 — SPARQL panel
    {
      id: 'step-13',
      attachTo: { element: '#right-panel', on: 'left' },
      text: 'Here you can see the SPARQL equivalent of the query you\'ve drawn in the <i>query creator</i>. Executing this query will give you all required results.',
      buttons: [
        { text: 'Back', action: () => ctx.back(), secondary: true },
        { text: 'Next', action: () => ctx.continue() },
      ],
      when: {
        show: () => {
          ctx.toggleSparql();
        },
      },
    },
    // Step 14 — Right-click info
    {
      id: 'step-14',
      text: 'For more options right-click on any element of the <i>query creator</i>.',
      buttons: [
        { text: 'Back', action: () => ctx.back(), secondary: true },
        { text: 'Finish', action: () => ctx.complete() },
      ],
    },
    // Step 15 — Help button
    {
      id: 'step-15',
      attachTo: { element: '#help-button', on: 'right' },
      text: 'If you need more help or want to see some examples click here.',
      buttons: [
        { text: 'Back', action: () => ctx.back(), secondary: true },
        { text: 'Finish', action: () => ctx.complete() },
      ],
    },
  ];
}

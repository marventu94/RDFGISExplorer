export interface FaqEntry {
  question: string;
  answer: string;
}

export const FAQ_ENTRIES: FaqEntry[] = [
  {
    question: 'How do I create a resource (node)?',
    answer: 'There are two ways to create resources:\n(i) drag-and-drop the result of a search, and,\n(ii) shift-click in the query creator (this will create a new variable).',
  },
  {
    question: 'How do I create a property (edge)?',
    answer: 'There are two ways to create properties:\n(i) drag-and-drop an existing property from the describe tool, and,\n(ii) press shift and drag one element to another.',
  },
  {
    question: 'How do I delete an element?',
    answer: 'To remove an element use right click to display more options and click in remove.',
  },
  {
    question: 'What do colors mean?',
    answer: 'The colour of the borders denotes the type of the elements:\nResources can be blue (constraints) or green (variables).\nProperties can be orange (object properties), purple (datatype properties) or red (variable properties).',
  },
  {
    question: 'What are the property types and what does it mean?',
    answer: 'There are two property types:\n(i) Object type properties are properties that links two resources, and,\n(ii) Datatype properties are properties that stored literal information (strings, numbers and so on), this kind of data can not be stored as a resource and can not have properties.',
  },
];

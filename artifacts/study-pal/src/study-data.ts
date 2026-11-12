export type QuizQuestion = {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
};

export type LessonChunk = {
  id: string;
  topic: string;
  level: string;
  title: string;
  text: string;
  examples: string[];
  questions: QuizQuestion[];
  minutes: number;
};

export type Progress = {
  lessonId: string;
  completed: boolean;
  completedAt: string | null;
};

export type QuizAttempt = {
  id: string;
  lessonId: string;
  score: number;
  total: number;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
};

export const lessons: LessonChunk[] = [
  {
    id: 'photosynthesis',
    topic: 'Biology',
    level: 'Year 9',
    title: 'How plants make their own food',
    minutes: 6,
    text: 'Photosynthesis is the process plants use to make glucose, a sugar that stores energy. It happens mostly in the leaves, inside tiny structures called chloroplasts. Chlorophyll, the green pigment in chloroplasts, captures energy from sunlight. The plant takes in carbon dioxide from the air through small pores called stomata, and water travels from the roots to the leaves. Using light energy, the plant changes carbon dioxide and water into glucose and oxygen. The word equation is: carbon dioxide + water → glucose + oxygen. Light is needed, but it is not written as a material because it supplies energy rather than matter. Plants use glucose for energy, growth, and to make other substances. Oxygen leaves the plant through the stomata.',
    examples: ['A plant kept in darkness cannot make enough glucose by photosynthesis, even if it has water and carbon dioxide.', 'A sunny leaf with plenty of water can photosynthesise faster than a shaded, dry leaf.'],
    questions: [{ question: 'Which gas is released during photosynthesis?', options: ['Nitrogen', 'Oxygen', 'Carbon dioxide'], answer: 1, explanation: 'Oxygen is made along with glucose and released from the leaf.' }, { question: 'What captures light energy in a leaf?', options: ['Chlorophyll', 'Glucose', 'Stomata'], answer: 0, explanation: 'Chlorophyll is the green pigment that captures light.' }],
  },
  {
    id: 'fractions',
    topic: 'Mathematics',
    level: 'Year 8',
    title: 'Adding fractions with unlike denominators',
    minutes: 5,
    text: 'A fraction names equal parts of a whole. To add fractions, first make their denominators the same. The denominator tells you the size of the parts, so you cannot directly add fifths to thirds. Find a common denominator, often the lowest common multiple of both denominators. Rewrite each fraction as an equivalent fraction with that denominator, then add the numerators and keep the denominator. Finally simplify if the numerator and denominator share a factor. For example, 1/3 + 1/4 becomes 4/12 + 3/12 = 7/12. The value stays the same when you multiply the numerator and denominator by the same number.',
    examples: ['For 2/5 + 1/10, use 10 as the common denominator: 4/10 + 1/10 = 5/10 = 1/2.', 'Check by estimating: 1/3 + 1/4 is a little more than 1/2, and 7/12 fits.'],
    questions: [{ question: 'What is 1/3 + 1/6?', options: ['2/9', '1/2', '2/6'], answer: 1, explanation: 'Rewrite 1/3 as 2/6, then add to get 3/6, which simplifies to 1/2.' }, { question: 'Why do fractions need a common denominator?', options: ['To make the parts the same size', 'To make the answer larger', 'To remove the numerator'], answer: 0, explanation: 'Only parts of the same size can be added directly.' }],
  },
  {
    id: 'forces',
    topic: 'Physics',
    level: 'Year 9',
    title: 'Balanced and unbalanced forces',
    minutes: 7,
    text: 'A force is a push or pull. Forces are measured in newtons (N). When forces on an object are balanced, their effects cancel and the resultant force is zero. The object stays still or continues moving at a steady speed in a straight line. When forces are unbalanced, there is a non-zero resultant force. The object speeds up, slows down, or changes direction. Resultant force means the overall force after combining all forces, including their directions. If two forces act in opposite directions, subtract the smaller from the larger. If they act in the same direction, add them.',
    examples: ['A book resting on a desk has gravity pulling down and the desk pushing up with equal force, so the forces are balanced.', 'A 10 N pull to the right and a 4 N pull to the left give a resultant force of 6 N to the right.'],
    questions: [{ question: 'What happens when the resultant force is zero?', options: ['Motion changes every second', 'There is no change in motion', 'The object must stop'], answer: 1, explanation: 'Balanced forces do not change an object’s motion.' }, { question: 'Two opposite forces are 8 N and 3 N. What is the resultant?', options: ['11 N', '5 N toward the 8 N force', '5 N toward the 3 N force'], answer: 1, explanation: 'Subtract 3 N from 8 N; the larger force sets the direction.' }],
  },
  {
    id: 'ecosystems',
    topic: 'Biology',
    level: 'Year 8',
    title: 'Food chains and energy',
    minutes: 6,
    text: 'A food chain shows how energy moves from one living thing to another. It usually begins with a producer, such as a green plant, which makes its own food using sunlight. A primary consumer eats the producer. A secondary consumer eats the primary consumer. Arrows point in the direction that energy moves, from the food to the eater. At each step, some energy is used by the organism or released as heat, so less energy is available at the next step. A food web combines several connected food chains and shows that organisms can have more than one food source.',
    examples: ['In grass → rabbit → fox, grass is the producer, the rabbit is the primary consumer, and the fox is the secondary consumer.', 'If rabbit numbers fall, foxes may have less food, while the grass may be eaten less.'],
    questions: [{ question: 'What does an arrow in a food chain show?', options: ['Where an animal lives', 'The direction energy moves', 'The biggest organism'], answer: 1, explanation: 'The arrow points from the food organism to the organism that eats it.' }, { question: 'Which organism is usually a producer?', options: ['A green plant', 'A fox', 'A rabbit'], answer: 0, explanation: 'Green plants make their own food, so they are producers.' }],
  },
  {
    id: 'atoms',
    topic: 'Chemistry',
    level: 'Year 9',
    title: 'Inside the atom',
    minutes: 6,
    text: 'All matter is made from atoms. An atom has a tiny central nucleus containing protons and neutrons, with electrons arranged around it. Protons have a positive charge, electrons have a negative charge, and neutrons have no charge. In a neutral atom, the number of protons equals the number of electrons, so the charges balance. Nearly all the mass of an atom is in its nucleus. The atomic number tells you the number of protons. Atoms of the same element always have the same number of protons, even if they have different numbers of neutrons.',
    examples: ['A neutral carbon atom has 6 protons and 6 electrons, so its positive and negative charges balance.', 'If an atom has 8 protons, its atomic number is 8 and the element is oxygen.'],
    questions: [{ question: 'Which particles have a negative charge?', options: ['Protons', 'Neutrons', 'Electrons'], answer: 2, explanation: 'Electrons have a negative charge.' }, { question: 'Where are nearly all of an atom’s mass?', options: ['In the nucleus', 'In empty space', 'In the electron shells'], answer: 0, explanation: 'The protons and neutrons in the nucleus contain nearly all the mass.' }],
  },
  {
    id: 'paragraphs',
    topic: 'English',
    level: 'Year 8',
    title: 'Building a clear argument paragraph',
    minutes: 5,
    text: 'A strong argument paragraph makes one clear point and supports it with evidence and explanation. A useful structure is point, evidence, explain. Begin with a sentence that states your idea. Add a quotation, fact, or example that supports it. Then explain how that evidence proves your point and why it matters. Keep each paragraph focused on one main idea. Linking words such as because, therefore, and however can help show how ideas connect. Do not leave a quotation to speak for itself; explain its meaning in your own words.',
    examples: ['Point: The character feels isolated. Evidence: the narrator says she “stood apart from the crowd”. Explain: this image suggests she is physically and emotionally separate.', 'Use a short quotation and spend more words explaining it than introducing it.'],
    questions: [{ question: 'What should follow evidence in this paragraph structure?', options: ['A new topic', 'An explanation', 'A title'], answer: 1, explanation: 'The explanation shows how the evidence supports the point.' }, { question: 'What is the main job of a point sentence?', options: ['State the paragraph’s main idea', 'Repeat the whole question', 'Add a quotation'], answer: 0, explanation: 'The point sentence introduces the one idea the paragraph develops.' }],
  },
];

export function createId() {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${Date.now().toString().padStart(13, '0')}-${suffix}`;
}

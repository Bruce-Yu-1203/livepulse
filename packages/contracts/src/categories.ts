import { z } from 'zod';

/**
 * Room categories are a fixed, code-defined list shared by the API and the web
 * app. Adding one needs a migration that widens the rooms_category_check
 * constraint as well as an entry here.
 */
export const roomCategories = [
  {
    description: 'Hanging out, Q&A and conversation with chat.',
    name: 'Just Chatting',
    slug: 'just-chatting',
  },
  {
    description: 'Out in the world: walks, travel, markets and events.',
    name: 'IRL',
    slug: 'irl',
  },
  {
    description: 'Every kind of game, from speedruns to cosy sims.',
    name: 'Gaming',
    slug: 'gaming',
  },
  {
    description: 'Live performance, DJ sets and practice sessions.',
    name: 'Music',
    slug: 'music',
  },
  {
    description: 'Drawing, design and making things by hand.',
    name: 'Art & Making',
    slug: 'art',
  },
  {
    description: 'Programming, hardware and building software live.',
    name: 'Tech & Coding',
    slug: 'tech',
  },
  {
    description: 'Study rooms and quiet co-working.',
    name: 'Study & Work',
    slug: 'study',
  },
  {
    description: 'Cooking, eating and food adventures.',
    name: 'Food',
    slug: 'food',
  },
  {
    description: 'Workouts, matches and outdoor sport.',
    name: 'Sports',
    slug: 'sports',
  },
] as const;

export type RoomCategoryInfo = (typeof roomCategories)[number];

export const roomCategorySlugs = roomCategories.map(
  (category) => category.slug,
) as [RoomCategoryInfo['slug'], ...RoomCategoryInfo['slug'][]];

export const RoomCategorySchema = z.enum(roomCategorySlugs);

export type RoomCategory = z.infer<typeof RoomCategorySchema>;

export const defaultRoomCategory: RoomCategory = 'just-chatting';

export function findRoomCategory(slug: string): RoomCategoryInfo | undefined {
  return roomCategories.find((category) => category.slug === slug);
}

/** Narrows a stored category, falling back to the default for unknown values. */
export function toRoomCategory(value: string): RoomCategory {
  const parsed = RoomCategorySchema.safeParse(value);
  return parsed.success ? parsed.data : defaultRoomCategory;
}

export const CategorySummarySchema = z
  .object({
    description: z.string().min(1),
    liveCount: z.number().int().nonnegative(),
    name: z.string().min(1),
    slug: RoomCategorySchema,
  })
  .strict();

export type CategorySummary = z.infer<typeof CategorySummarySchema>;

export const ListCategoriesResponseSchema = z
  .object({
    items: z.array(CategorySummarySchema),
    requestId: z.string().min(1),
  })
  .strict();

export type ListCategoriesResponse = z.infer<
  typeof ListCategoriesResponseSchema
>;

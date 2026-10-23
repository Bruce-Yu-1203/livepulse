import { z } from 'zod';

import { VisibleRoomSchema } from './rooms.js';

export const SearchQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(10).default(6),
    q: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .transform((value) => value.replace(/\s+/gu, ' ')),
  })
  .strict();

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SearchUserSchema = z
  .object({
    avatarUrl: z.url().nullable(),
    id: z.uuid(),
    name: z.string().min(1).max(120),
    username: z.string().max(30).nullable(),
  })
  .strict();

export type SearchUser = z.infer<typeof SearchUserSchema>;

export const SearchSuggestionsResponseSchema = z
  .object({
    requestId: z.string().min(1),
    rooms: z.array(VisibleRoomSchema),
    users: z.array(SearchUserSchema),
  })
  .strict();

export type SearchSuggestionsResponse = z.infer<
  typeof SearchSuggestionsResponseSchema
>;

export const GetPublicUserParamsSchema = z.object({ id: z.uuid() }).strict();

export const GetPublicUserResponseSchema = z
  .object({
    requestId: z.string().min(1),
    user: SearchUserSchema.extend({ joinedAt: z.iso.datetime() }),
  })
  .strict();

export type GetPublicUserResponse = z.infer<typeof GetPublicUserResponseSchema>;

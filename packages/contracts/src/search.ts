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
    user: SearchUserSchema.extend({
      followerCount: z.number().int().nonnegative(),
      followingCount: z.number().int().nonnegative(),
      joinedAt: z.iso.datetime(),
    }),
  })
  .strict();

export type GetPublicUserResponse = z.infer<typeof GetPublicUserResponseSchema>;

export const FollowListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
  })
  .strict();

export type FollowListQuery = z.infer<typeof FollowListQuerySchema>;

export const FollowListResponseSchema = z
  .object({
    items: z.array(SearchUserSchema),
    nextPage: z.number().int().positive().nullable(),
    requestId: z.string().min(1),
  })
  .strict();

export type FollowListResponse = z.infer<typeof FollowListResponseSchema>;

export const FollowStateResponseSchema = z
  .object({
    followerCount: z.number().int().nonnegative(),
    following: z.boolean(),
    followingCount: z.number().int().nonnegative(),
    requestId: z.string().min(1),
  })
  .strict();

export type FollowStateResponse = z.infer<typeof FollowStateResponseSchema>;

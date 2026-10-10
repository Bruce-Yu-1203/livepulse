export {
  RoomStatus,
  RoomStatusSchema,
  UserRole,
  UserRoleSchema,
} from './roles-and-rooms.js';

export { HealthResponseSchema } from './health.js';
export type { HealthResponse } from './health.js';

export {
  ApiErrorCode,
  ApiErrorResponseSchema,
  CsrfResponseSchema,
  CurrentUserResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  RefreshResponseSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
} from './auth.js';
export type {
  ApiErrorResponse,
  CsrfResponse,
  CurrentUserResponse,
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  RegisterRequest,
  RegisterResponse,
} from './auth.js';

export {
  CreateRoomRequestSchema,
  CreateRoomResponseSchema,
  GetRoomParamsSchema,
  GetRoomResponseSchema,
  ListOwnedRoomsResponseSchema,
  ListRoomsQuerySchema,
  ListRoomsResponseSchema,
  RoomSchema,
  UpdateRoomRequestSchema,
  UpdateRoomResponseSchema,
  VisibleRoomSchema,
} from './rooms.js';
export type {
  CreateRoomRequest,
  CreateRoomResponse,
  GetRoomResponse,
  ListOwnedRoomsResponse,
  ListRoomsQuery,
  ListRoomsResponse,
  Room,
  UpdateRoomRequest,
  UpdateRoomResponse,
  VisibleRoom,
} from './rooms.js';

export {
  ClientRealtimeEventSchema,
  MessageCreatedEventSchema,
  MessageSendEventSchema,
  RealtimeErrorEventSchema,
  RoomJoinedEventSchema,
  RoomJoinEventSchema,
  ServerRealtimeEventSchema,
} from './realtime.js';
export type {
  ClientRealtimeEvent,
  MessageCreatedEvent,
  ServerRealtimeEvent,
} from './realtime.js';

export {
  ListRoomMessagesQuerySchema,
  ListRoomMessagesResponseSchema,
  RoomMessageSchema,
} from './messages.js';
export type {
  ListRoomMessagesQuery,
  ListRoomMessagesResponse,
  RoomMessage,
} from './messages.js';

/**
 * Collection Schemas
 *
 * All collections with columns and RBAC permissions.
 * Single source of truth — imported by both worker and frontend.
 *
 * The worker's AppRecordRoom serves every room with this full list, so the
 * app room and each `table:<id>` room can host any of them. The client mounts
 * `appSchemas` on the app scope and `tableRoomSchemas` on a table scope.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { tablesSchema, tableRoomSchemas } from './schemas/game-schemas'

export { tableRoomSchemas }

export const appSchemas: CollectionSchema[] = [usersSchema, settingsSchema, tablesSchema]

export const schemas: CollectionSchema[] = [...appSchemas, ...tableRoomSchemas]

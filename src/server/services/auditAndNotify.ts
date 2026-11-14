import { db } from '../../db/index.ts';
import { auditLogs, notifications } from '../../db/schema.ts';
import { emitToUser } from '../realtime.ts';

export async function logAudit(params: {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLogs).values({
      actorId: params.actorId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: params.metadata ?? {},
    });
  } catch (err) {
    console.error('Audit log insert failed:', err);
  }
}

export async function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}) {
  try {
    const [created] = await db
      .insert(notifications)
      .values({
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        entityType: params.entityType ?? 'SYSTEM',
        entityId: params.entityId ?? '',
      })
      .returning();

    if (created) {
      emitToUser(params.userId, 'notification:new', created);
    }
    return created;
  } catch (err) {
    console.error('Notification insert failed:', err);
    return null;
  }
}

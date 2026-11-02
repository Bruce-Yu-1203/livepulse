/**
 * Decide how the generator should treat an incoming message.created event.
 *
 * The direct pipeline broadcasts one event that both confirms the sender and
 * delivers to recipients. The Kafka pipeline sends the sender a separate
 * admission ACK that echoes the send requestId, then the broadcast worker
 * delivers a copy with a new requestId to every room member.
 */
export function classifyCreatedEvent({ separateAck, sentRequestIds, event }) {
  if (separateAck && sentRequestIds.has(event?.requestId)) return 'ack';
  return separateAck ? 'delivery' : 'ack-and-delivery';
}

export function roomForMember(room, memberId) {
  const member = room.members.find(entry => entry.id === memberId);
  if (member?.approved && !member.manual) {
    const { pendingMembers, drawRevision, ...snapshot } = room;
    return memberId === room.hostId && pendingMembers?.length ? { ...snapshot, pendingMembers } : snapshot;
  }
  return { roomId: room.roomId, revision: room.revision, pendingApproval: true };
}

export function roomReplyForMember(reply, room, memberId) {
  if (!reply.room || reply.room.pendingApproval) return reply;
  const currentView = roomForMember(room, memberId);
  return { ...reply, room: currentView.pendingApproval ? currentView : roomForMember(reply.room, memberId) };
}

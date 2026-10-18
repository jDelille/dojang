'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { PANEL } from '@/components/odoo/shared';
import { explainHubError } from '@/lib/hub-actions';
import { HubGate, Notice, useHubRead, when } from '@/components/hub/hub-client';
import { cn } from '@/lib/utils';

/**
 * Ported from Jodi's ConnectedMemberDetails: the parts of a member's Hub
 * workspace (`member_workspace`) that Roster's Member 360 doesn't read itself.
 * Odoo returns family, safety and documents only to managers and owners.
 */

type Family = {
  household: string | null;
  members: { id: string; name: string }[];
  householdGuardians?: { id: string; name: string; primary: boolean }[];
  guardians: { id: string; name: string; channel: string; allowReply: boolean }[];
};
type Safety = {
  allergies: string | null;
  medicalNotes: string | null;
  emergencyNote: string | null;
  contacts: { id: string; name: string; phone: string; relationship: string; primary: boolean }[];
};
type Documents = {
  waiver: null | { state: string; signedBy: string | null; signedAt: string | null };
  files: { id: string; name: string; mimeType: string; bytes: number }[];
};
type Workspace = {
  member?: { id: string };
  family: Family | null;
  safety: Safety | null;
  documents: Documents | null;
  messages: { id: string; text: string; state: string; channel: string; summary: string }[];
  timeline: { id: string; action: string; actor: string; at: string }[];
};

const TEXT = 'text-[13px]';
const ROW = 'space-y-1 border-t border-[color:var(--color-border)] pt-3 first:border-t-0 first:pt-0';

/** Loads the member's Hub workspace and shows `render(data)`, or the loading/error state. */
function WorkspaceRecords({ memberId, children }: { memberId: string; children: (data: Workspace) => ReactNode }) {
  const workspace = useHubRead<Workspace>(`members/${memberId}`);
  if (workspace.error && !workspace.loading) return <Notice tone="alert">{explainHubError(workspace.error)}</Notice>;
  if (!workspace.data) return <Notice>Loading this member’s authorized records…</Notice>;
  if (workspace.data.member?.id !== memberId) return <Notice tone="alert">{explainHubError('MEMBER_DETAILS_UNAVAILABLE')}</Notice>;
  return <>{children(workspace.data)}</>;
}

/** A Member 360 panel that needs the staff member's own Hub access. */
function HubPanel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className={cn(PANEL, 'space-y-3')} aria-label={label}>
      <p className="eyebrow">{label}</p>
      <HubGate capability="members.read">{children}</HubGate>
    </section>
  );
}

/** Household, household guardians and verified guardian channels (used on Member 360 and Manage in Odoo). */
export function FamilyRecords({ memberId }: { memberId: string }) {
  return (
    <WorkspaceRecords memberId={memberId}>
      {(data) => {
        const family = data.family;
        if (!family) return <p className={TEXT}>Family and guardian details require manager or owner access.</p>;
        return (
          <>
            <p className={TEXT}>
              Household: <strong>{family.household || 'Not linked'}</strong>
            </p>
            {family.members.map((member) => (
              <p key={member.id} className={TEXT}>
                <Link href={`/dashboard/contacts/${member.id}`} className="underline underline-offset-4">
                  {member.name} →
                </Link>
              </p>
            ))}
            <h3 className="font-semibold">Household guardians</h3>
            {family.householdGuardians?.length ? (
              family.householdGuardians.map((guardian) => (
                <div key={guardian.id} className={ROW}>
                  <strong className={TEXT}>{guardian.name}</strong>
                  <p className={cn(TEXT, 'muted')}>{guardian.primary ? 'Primary guardian' : 'Guardian'} · Native household relationship</p>
                </div>
              ))
            ) : (
              <p className={TEXT}>No guardian is recorded on this household.</p>
            )}
            <p className="text-[12px] muted">
              A household guardian is not a verified messaging channel and does not grant signing, payment or portal access.
            </p>
            <h3 className="font-semibold">Verified guardian channels</h3>
            {family.guardians.length ? (
              family.guardians.map((guardian) => (
                <div key={guardian.id} className={ROW}>
                  <strong className={TEXT}>{guardian.name}</strong>
                  <p className={cn(TEXT, 'muted')}>
                    {guardian.channel} · {guardian.allowReply ? 'Replies permitted' : 'Replies not permitted'}
                  </p>
                </div>
              ))
            ) : (
              <p className={TEXT}>No verified guardian channel is linked. A matching name or household does not establish consent.</p>
            )}
          </>
        );
      }}
    </WorkspaceRecords>
  );
}

export function MemberFamilyPanel({ memberId }: { memberId: string }) {
  return (
    <HubPanel label="Household and verified guardians">
      <FamilyRecords memberId={memberId} />
    </HubPanel>
  );
}

export function MemberMessagesPanel({ memberId }: { memberId: string }) {
  return (
    <HubPanel label="Parent messages">
      <WorkspaceRecords memberId={memberId}>
        {(data) => (
          <>
            {data.messages.length ? (
              data.messages.map((message) => (
                <div key={message.id} className={ROW}>
                  <strong className={TEXT}>
                    {message.channel} · {message.state}
                  </strong>
                  <p className={TEXT}>{message.text}</p>
                  {message.summary && <p className={cn(TEXT, 'muted')}>{message.summary}</p>}
                </div>
              ))
            ) : (
              <p className={TEXT}>No messages for this member in the latest 50 authorized messages.</p>
            )}
            <Link href="/dashboard/inbox" className="text-[13px] font-semibold underline underline-offset-4">
              Open the inbox →
            </Link>
          </>
        )}
      </WorkspaceRecords>
    </HubPanel>
  );
}

export function MemberStaffActionsPanel({ memberId }: { memberId: string }) {
  return (
    <HubPanel label="Recorded staff actions">
      <WorkspaceRecords memberId={memberId}>
        {(data) => (
          <>
            {data.timeline.length ? (
              data.timeline.map((entry) => (
                <div key={entry.id} className={ROW}>
                  <strong className={TEXT}>{entry.action.replaceAll('_', ' ')}</strong>
                  <p className={cn(TEXT, 'muted')}>
                    {entry.actor} · {when(entry.at)}
                  </p>
                </div>
              ))
            ) : (
              <p className={TEXT}>No recorded Companion actions for this member.</p>
            )}
            <p className="text-[12px] muted">Member entries from the latest 50 authorized workspace actions.</p>
          </>
        )}
      </WorkspaceRecords>
    </HubPanel>
  );
}

export function MemberSafetyPanel({ memberId }: { memberId: string }) {
  return (
    <HubPanel label="Safety">
      <WorkspaceRecords memberId={memberId}>
        {(data) => {
          const safety = data.safety;
          if (!safety) return <p className={TEXT}>Private safety information requires manager or owner access.</p>;
          return (
            <>
              <h3 className="font-semibold">Emergency contacts</h3>
              {safety.contacts.length ? (
                safety.contacts.map((contact) => (
                  <div key={contact.id} className={ROW}>
                    <strong className={TEXT}>
                      {contact.name}
                      {contact.primary ? ' · Primary' : ''}
                    </strong>
                    <p className={cn(TEXT, 'muted')}>
                      {contact.relationship} ·{' '}
                      <a href={`tel:${contact.phone}`} dir="ltr" className="underline underline-offset-4">
                        {contact.phone}
                      </a>
                    </p>
                  </div>
                ))
              ) : (
                <p className={TEXT}>No emergency contact recorded.</p>
              )}
              <h3 className="font-semibold">Allergies</h3>
              <p className={TEXT}>{safety.allergies || 'Not recorded'}</p>
              <h3 className="font-semibold">Medical notes</h3>
              <p className={TEXT}>{safety.medicalNotes || 'Not recorded'}</p>
              <h3 className="font-semibold">Emergency note</h3>
              <p className={TEXT}>{safety.emergencyNote || 'Not recorded'}</p>
              <p className="text-[12px] muted">
                Missing information is not confirmation that no health needs exist. Record updates through the school’s authorized process.
              </p>
            </>
          );
        }}
      </WorkspaceRecords>
    </HubPanel>
  );
}

export function MemberDocumentsPanel({ memberId }: { memberId: string }) {
  return (
    <HubPanel label="Document register">
      <WorkspaceRecords memberId={memberId}>
        {(data) => {
          const documents = data.documents;
          if (!documents) return <p className={TEXT}>Private documents require manager or owner access.</p>;
          return (
            <>
              {documents.waiver && (
                <p className={TEXT}>
                  Waiver: {documents.waiver.state}
                  {documents.waiver.signedBy ? ` · ${documents.waiver.signedBy}` : ''}
                  {documents.waiver.signedAt ? ` · ${when(documents.waiver.signedAt)}` : ''}
                </p>
              )}
              {documents.files.length ? (
                documents.files.map((file) => (
                  <div key={file.id} className={ROW}>
                    <strong className={TEXT}>{file.name}</strong>
                    <p className={cn(TEXT, 'muted')}>
                      {file.mimeType} · {Math.ceil(file.bytes / 1024)} KB
                    </p>
                  </div>
                ))
              ) : (
                <p className={TEXT}>No files attached directly to this member record.</p>
              )}
              <p className="text-[12px] muted">
                Most recent 30 attachment records. File downloads and signing remain in the authorized document workflow.
              </p>
            </>
          );
        }}
      </WorkspaceRecords>
    </HubPanel>
  );
}

import { MatchDataFetcher } from '@/components/QR/MatchDataFetcher';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  addOrganizationMember,
  applyScoutingAssignment,
  clearScoutingAssignments,
  generateScoutingAssignments,
  removeOrganizationMember,
  setOrganizationDetails,
  signInOrganizationMember,
  useQRScoutState,
} from '@/store/store';
import { CalendarCheck, ClipboardList, LogIn, Trash2, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';

type MemberRole = 'lead' | 'scouter';

function isAssignmentComplete(
  assignment: ReturnType<typeof useQRScoutState.getState>['organization']['assignments'][number],
  submissions: ReturnType<typeof useQRScoutState.getState>['submissions'],
) {
  return submissions.some(submission => {
    const scouterMatches =
      !assignment.scouterInitials ||
      !submission.scouter ||
      submission.scouter.toUpperCase() === assignment.scouterInitials.toUpperCase();

    return (
      submission.matchNumber === assignment.matchNumber &&
      submission.teamNumber === assignment.teamNumber &&
      scouterMatches
    );
  });
}

export function OrganizationSetup() {
  const organization = useQRScoutState(state => state.organization);
  const matchData = useQRScoutState(state => state.matchData);
  const submissions = useQRScoutState(state => state.submissions);
  const [memberName, setMemberName] = useState('');
  const [memberInitials, setMemberInitials] = useState('');
  const [memberRole, setMemberRole] = useState<MemberRole>('scouter');
  const [message, setMessage] = useState('');

  const signedInMember = organization.members.find(
    member => member.id === organization.signedInMemberId,
  );
  const scouterCount = organization.members.filter(
    member => member.role === 'scouter',
  ).length;
  const completedAssignmentIds = useMemo(
    () =>
      new Set(
        organization.assignments
          .filter(assignment => isAssignmentComplete(assignment, submissions))
          .map(assignment => assignment.id),
      ),
    [organization.assignments, submissions],
  );
  const myAssignments = organization.assignments.filter(
    assignment => assignment.scouterId === organization.signedInMemberId,
  );
  const nextAssignment =
    myAssignments.find(assignment => !completedAssignmentIds.has(assignment.id)) ||
    myAssignments[0];
  const matchCount = matchData?.filter(match => match.comp_level === 'qm').length || 0;

  function addMember() {
    addOrganizationMember({
      name: memberName,
      initials: memberInitials,
      role: memberRole,
    });
    setMemberName('');
    setMemberInitials('');
    setMemberRole('scouter');
  }

  function generateAssignments() {
    try {
      generateScoutingAssignments();
      setMessage('Assignments generated.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to generate assignments.');
    }
  }

  return (
    <div className="w-full max-w-7xl space-y-4 text-left">
      {message && (
        <div className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          {message}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <Card>
          <CardHeader>
            <CardTitle>Organization Setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-sm font-medium">
                Organization
                <Input
                  value={organization.name}
                  onChange={event =>
                    setOrganizationDetails({ name: event.currentTarget.value })
                  }
                />
              </label>
              <label className="space-y-1 text-sm font-medium">
                Join Code
                <Input
                  value={organization.code}
                  onChange={event =>
                    setOrganizationDetails({ code: event.currentTarget.value })
                  }
                />
              </label>
              <label className="space-y-1 text-sm font-medium">
                Event Label
                <Input
                  value={organization.eventName}
                  onChange={event =>
                    setOrganizationDetails({ eventName: event.currentTarget.value })
                  }
                  placeholder="2026 Week 1"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_140px_auto]">
              <Input
                value={memberName}
                onChange={event => setMemberName(event.currentTarget.value)}
                placeholder="Scouter name"
              />
              <Input
                value={memberInitials}
                onChange={event => setMemberInitials(event.currentTarget.value)}
                placeholder="Initials"
              />
              <Select
                value={memberRole}
                onValueChange={value => setMemberRole(value as MemberRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scouter">Scouter</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={addMember}>
                <UserPlus className="size-4" />
                Add
              </Button>
            </div>

            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Initials</th>
                    <th className="px-3 py-2 text-left">Role</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {organization.members.map(member => (
                    <tr key={member.id} className="border-t">
                      <td className="px-3 py-2">{member.name}</td>
                      <td className="px-3 py-2 font-semibold">{member.initials}</td>
                      <td className="px-3 py-2 capitalize">{member.role}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeOrganizationMember(member.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {organization.members.length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-center text-muted-foreground" colSpan={4}>
                        Add students or mentors who will scout matches.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scouter Sign-In</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              value={organization.signedInMemberId || ''}
              onValueChange={signInOrganizationMember}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose your name" />
              </SelectTrigger>
              <SelectContent>
                {organization.members.map(member => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name} ({member.initials})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="rounded-md bg-muted p-4">
              <div className="text-sm text-muted-foreground">Signed in as</div>
              <div className="mt-1 text-xl font-semibold">
                {signedInMember
                  ? `${signedInMember.name} (${signedInMember.initials})`
                  : 'No one yet'}
              </div>
            </div>
            {nextAssignment && (
              <Button
                className="w-full"
                onClick={() => applyScoutingAssignment(nextAssignment)}
              >
                <LogIn className="size-4" />
                Open Next Assignment
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assignment Generator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <MatchDataFetcher onError={setMessage} />
            <Button onClick={generateAssignments}>
              <CalendarCheck className="size-4" />
              Generate
            </Button>
            <Button variant="secondary" onClick={clearScoutingAssignments}>
              <Trash2 className="size-4" />
              Clear
            </Button>
            <Badge variant="secondary">{matchCount} matches</Badge>
            <Badge variant="secondary">{scouterCount} scouters</Badge>
            <Badge variant="secondary">
              {completedAssignmentIds.size}/{organization.assignments.length} done
            </Badge>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Match</th>
                  <th className="px-3 py-2 text-left">Robot</th>
                  <th className="px-3 py-2 text-left">Scouter</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {organization.assignments.map(assignment => {
                  const complete = completedAssignmentIds.has(assignment.id);
                  return (
                    <tr key={assignment.id} className="border-t">
                      <td className="px-3 py-2 font-semibold">
                        Q{assignment.matchNumber}
                      </td>
                      <td className="px-3 py-2">
                        Team {assignment.teamNumber} ({assignment.robotPosition})
                      </td>
                      <td className="px-3 py-2">
                        {assignment.scouterInitials || 'Unassigned'}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={complete ? 'default' : 'outline'}>
                          {complete ? 'Submitted' : 'Open'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => applyScoutingAssignment(assignment)}
                        >
                          <ClipboardList className="size-4" />
                          Open
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {organization.assignments.length === 0 && (
                  <tr>
                    <td className="px-3 py-8 text-center text-muted-foreground" colSpan={5}>
                      Load match data, add scouters, then generate assignments.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

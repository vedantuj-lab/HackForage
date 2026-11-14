import { db } from './index.ts';
import {
  auditLogs,
  eventSettings,
  invitations,
  leadershipHistory,
  notifications,
  profiles,
  skills,
  teamMembers,
  teamRequirements,
  teams,
  userSkills,
  users,
  waitlistEntries,
} from './schema.ts';
import { count, eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { recalculateAndPersistTeamHealth } from '../server/engines/teamHealth.ts';
import { calculateAndPersistCompatibility } from '../server/engines/compatibility.ts';

let seedPromise: Promise<void> | null = null;

const SEED_SKILLS: Array<{ name: string; category: string }> = [
  { name: 'HTML', category: 'Frontend' },
  { name: 'CSS', category: 'Frontend' },
  { name: 'JavaScript', category: 'Frontend' },
  { name: 'TypeScript', category: 'Frontend' },
  { name: 'React', category: 'Frontend' },
  { name: 'Angular', category: 'Frontend' },
  { name: 'Vue', category: 'Frontend' },
  { name: 'Node.js', category: 'Backend' },
  { name: 'Express', category: 'Backend' },
  { name: 'NestJS', category: 'Backend' },
  { name: 'Python', category: 'Backend' },
  { name: 'Java', category: 'Backend' },
  { name: 'Spring Boot', category: 'Backend' },
  { name: 'PostgreSQL', category: 'Database' },
  { name: 'MySQL', category: 'Database' },
  { name: 'MongoDB', category: 'Database' },
  { name: 'Redis', category: 'Database' },
  { name: 'TensorFlow', category: 'AI/ML' },
  { name: 'Scikit-learn', category: 'AI/ML' },
  { name: 'Machine Learning', category: 'AI/ML' },
  { name: 'Data Analysis', category: 'AI/ML' },
  { name: 'PyTorch', category: 'AI/ML' },
  { name: 'Figma', category: 'Design' },
  { name: 'UI/UX', category: 'Design' },
  { name: 'Prototyping', category: 'Design' },
  { name: 'AWS', category: 'Cloud' },
  { name: 'Azure', category: 'Cloud' },
  { name: 'Docker', category: 'Cloud' },
  { name: 'Kubernetes', category: 'Cloud' },
];

const EXTRA_PARTICIPANTS = [
  { name: 'Aarav Mehta', role: 'Frontend Developer', exp: 'Advanced', cat: 'Artificial Intelligence', mode: 'Hybrid', skills: ['React', 'TypeScript', 'CSS', 'JavaScript'], inst: 'SLRTCE Mumbai' },
  { name: 'Diya Patel', role: 'Frontend Developer', exp: 'Intermediate', cat: 'Artificial Intelligence', mode: 'Hybrid', skills: ['React', 'HTML', 'CSS', 'JavaScript'], inst: 'VJTI Mumbai' },
  { name: 'Siddharth Rao', role: 'Backend Developer', exp: 'Expert', cat: 'FinTech', mode: 'Remote', skills: ['Node.js', 'PostgreSQL', 'NestJS', 'Redis'], inst: 'IIT Bombay' },
  { name: 'Neha Verma', role: 'Backend Developer', exp: 'Intermediate', cat: 'Healthcare', mode: 'Hybrid', skills: ['Python', 'PostgreSQL', 'Docker', 'Express'], inst: 'DJ Sanghvi' },
  { name: 'Ishaan Joshi', role: 'AI/ML Developer', exp: 'Advanced', cat: 'Healthcare', mode: 'Remote', skills: ['Python', 'TensorFlow', 'Machine Learning', 'Data Analysis'], inst: 'SPIT Mumbai' },
  { name: 'Priya Iyer', role: 'UI/UX Designer', exp: 'Advanced', cat: 'Healthcare', mode: 'Hybrid', skills: ['Figma', 'UI/UX', 'Prototyping', 'HTML'], inst: 'NID Ahmedabad' },
  { name: 'Arjun Malhotra', role: 'Full-Stack Developer', exp: 'Advanced', cat: 'FinTech', mode: 'On-site', skills: ['React', 'Node.js', 'PostgreSQL', 'TypeScript'], inst: 'COEP Pune' },
  { name: 'Tanvi Deshpande', role: 'Data Analyst', exp: 'Intermediate', cat: 'Sustainability', mode: 'Hybrid', skills: ['Python', 'Data Analysis', 'PostgreSQL', 'Scikit-learn'], inst: 'PICT Pune' },
  { name: 'Vikram Singh', role: 'Backend Developer', exp: 'Advanced', cat: 'Cybersecurity', mode: 'Remote', skills: ['Java', 'Spring Boot', 'PostgreSQL', 'Docker'], inst: 'NIT Surathkal' },
  { name: 'Riya Kapoor', role: 'Project Manager', exp: 'Intermediate', cat: 'Education', mode: 'Flexible', skills: ['Figma', 'UI/UX', 'Data Analysis', 'HTML'], inst: 'NMIMS Mumbai' },
  { name: 'Karan Shah', role: 'Full-Stack Developer', exp: 'Intermediate', cat: 'Smart Cities', mode: 'Hybrid', skills: ['React', 'Node.js', 'MongoDB', 'AWS'], inst: 'SLRTCE Mumbai' },
  { name: 'Sanya Gupta', role: 'AI/ML Developer', exp: 'Expert', cat: 'Smart Cities', mode: 'Remote', skills: ['Python', 'PyTorch', 'Machine Learning', 'Docker'], inst: 'IIIT Hyderabad' },
  { name: 'Devansh Trivedi', role: 'Frontend Developer', exp: 'Beginner', cat: 'Education', mode: 'Flexible', skills: ['HTML', 'CSS', 'JavaScript', 'Vue'], inst: 'Thakur College' },
  { name: 'Aditi Nair', role: 'Presenter', exp: 'Advanced', cat: 'Sustainability', mode: 'Hybrid', skills: ['Figma', 'Prototyping', 'Data Analysis', 'UI/UX'], inst: 'KJ Somaiya' },
  { name: 'Nikhil Bansal', role: 'Backend Developer', exp: 'Advanced', cat: 'Agriculture', mode: 'On-site', skills: ['Python', 'PostgreSQL', 'Redis', 'AWS'], inst: 'BITS Pilani' },
  { name: 'Pooja Krishnan', role: 'Researcher', exp: 'Intermediate', cat: 'Healthcare', mode: 'Remote', skills: ['Python', 'Scikit-learn', 'Data Analysis'], inst: 'Manipal Tech' },
  { name: 'Harshvardhan Kale', role: 'Full-Stack Developer', exp: 'Advanced', cat: 'Cybersecurity', mode: 'Hybrid', skills: ['TypeScript', 'Node.js', 'React', 'Kubernetes'], inst: 'VESIT Mumbai' },
  { name: 'Sneha Chawla', role: 'UI/UX Designer', exp: 'Intermediate', cat: 'FinTech', mode: 'Flexible', skills: ['Figma', 'UI/UX', 'Prototyping', 'CSS'], inst: 'MIT WPU' },
  { name: 'Omkar Sawant', role: 'Backend Developer', exp: 'Intermediate', cat: 'Agriculture', mode: 'Hybrid', skills: ['Node.js', 'Express', 'MySQL', 'Docker'], inst: 'SLRTCE Mumbai' },
  { name: 'Zoya Khan', role: 'AI/ML Developer', exp: 'Intermediate', cat: 'Education', mode: 'Remote', skills: ['Python', 'TensorFlow', 'Machine Learning'], inst: 'Jamia Millia' },
  { name: 'Pranav Gokhale', role: 'Frontend Developer', exp: 'Advanced', cat: 'Smart Cities', mode: 'On-site', skills: ['React', 'TypeScript', 'Angular', 'CSS'], inst: 'VIT Vellore' },
  { name: 'Maya Subramanian', role: 'Data Analyst', exp: 'Advanced', cat: 'FinTech', mode: 'Hybrid', skills: ['Python', 'PostgreSQL', 'Data Analysis', 'Scikit-learn'], inst: 'PSG Tech' },
  { name: 'Yashwant Patil', role: 'Backend Developer', exp: 'Intermediate', cat: 'Sustainability', mode: 'Remote', skills: ['Node.js', 'PostgreSQL', 'Docker', 'AWS'], inst: 'SLRTCE Mumbai' },
  { name: 'Esha Banerjee', role: 'Presenter', exp: 'Intermediate', cat: 'Agriculture', mode: 'Flexible', skills: ['Prototyping', 'UI/UX', 'Figma', 'Data Analysis'], inst: 'Jadavpur Univ' },
  { name: 'Kunal Chhabra', role: 'Full-Stack Developer', exp: 'Beginner', cat: 'Cybersecurity', mode: 'Hybrid', skills: ['JavaScript', 'React', 'Node.js', 'MongoDB'], inst: 'SRM Chennai' },
];

export async function runSeed() {
  const [{ cnt }] = await db.select({ cnt: count() }).from(users);
  if (Number(cnt) > 0) {
    return;
  }

  // 1. Event Settings
  await db.insert(eventSettings).values({
    eventName: 'HackForge Global 2026',
    maxTeamCapacity: 5,
    waitlistExpiryMinutes: 60,
    allowTeamCreation: true,
    autoWaitlistPromotion: true,
  });

  // 2. Skills catalog
  const insertedSkills = await db.insert(skills).values(SEED_SKILLS).returning();
  const skillMap = new Map(insertedSkills.map((s) => [s.name, s.id]));

  const demoPasswordHash = await bcrypt.hash('HackForge@2026', 10);

  // 3. Core Demo Accounts
  const [adminUser] = await db
    .insert(users)
    .values({
      uid: 'local-admin-001',
      email: 'admin@hackforge.demo',
      passwordHash: demoPasswordHash,
      fullName: 'Vedant Dalvi',
      role: 'ADMIN',
      status: 'ACTIVE',
      institution: 'Shree L.R. Tiwari College of Engineering',
      location: 'Mumbai, India',
    })
    .returning();

  const [leaderUser] = await db
    .insert(users)
    .values({
      uid: 'local-leader-001',
      email: 'leader@hackforge.demo',
      passwordHash: demoPasswordHash,
      fullName: 'Rohan Kulkarni',
      role: 'TEAM_LEADER',
      status: 'ACTIVE',
      institution: 'Shree L.R. Tiwari College of Engineering',
      location: 'Mumbai, India',
    })
    .returning();

  const [p1User] = await db
    .insert(users)
    .values({
      uid: 'local-participant-001',
      email: 'participant1@hackforge.demo',
      passwordHash: demoPasswordHash,
      fullName: 'Ananya Deshmukh',
      role: 'PARTICIPANT',
      status: 'ACTIVE',
      institution: 'VJTI Mumbai',
      location: 'Mumbai, India',
    })
    .returning();

  const [p2User] = await db
    .insert(users)
    .values({
      uid: 'local-participant-002',
      email: 'participant2@hackforge.demo',
      passwordHash: demoPasswordHash,
      fullName: 'Meera Nair',
      role: 'PARTICIPANT',
      status: 'ACTIVE',
      institution: 'IIT Bombay',
      location: 'Mumbai, India',
    })
    .returning();

  const [p3User] = await db
    .insert(users)
    .values({
      uid: 'local-participant-003',
      email: 'participant3@hackforge.demo',
      passwordHash: demoPasswordHash,
      fullName: 'Kabir Sharma',
      role: 'PARTICIPANT',
      status: 'ACTIVE',
      institution: 'SPIT Mumbai',
      location: 'Mumbai, India',
    })
    .returning();

  // Profiles for core accounts
  await db.insert(profiles).values([
    {
      userId: adminUser.id,
      avatarUrl: '/src/assets/images/avatar_engineer_one_1794634322291.jpg',
      bio: 'HackForge platform architect and hackathon operations lead at SLRTCE.',
      experienceLevel: 'Expert',
      preferredRole: 'Project Manager',
      projectInterests: ['Artificial Intelligence', 'FinTech', 'Smart Cities'],
      collaborationMode: 'Hybrid',
      completionPct: 100,
    },
    {
      userId: leaderUser.id,
      avatarUrl: '',
      bio: 'Distributed systems builder leading Team Alpha for AI & backend infrastructure.',
      experienceLevel: 'Advanced',
      preferredRole: 'Backend Developer',
      projectInterests: ['Artificial Intelligence', 'FinTech'],
      collaborationMode: 'Hybrid',
      completionPct: 100,
    },
    {
      userId: p1User.id,
      avatarUrl: '/src/assets/images/avatar_engineer_one_1794634322291.jpg',
      bio: 'AI/ML engineer specializing in PyTorch, TensorFlow, and scalable inference APIs.',
      experienceLevel: 'Advanced',
      preferredRole: 'AI/ML Developer',
      projectInterests: ['Artificial Intelligence', 'Healthcare', 'FinTech'],
      collaborationMode: 'Hybrid',
      completionPct: 100,
    },
    {
      userId: p2User.id,
      avatarUrl: '/src/assets/images/avatar_designer_two_1794634322725.jpg',
      bio: 'Product designer crafting accessible design systems, prototypes, and pitch decks.',
      experienceLevel: 'Advanced',
      preferredRole: 'UI/UX Designer',
      projectInterests: ['Artificial Intelligence', 'Education', 'Sustainability'],
      collaborationMode: 'Hybrid',
      completionPct: 100,
    },
    {
      userId: p3User.id,
      avatarUrl: '',
      bio: 'Full-stack engineer focused on TypeScript, React, PostgreSQL, and cloud deployments.',
      experienceLevel: 'Intermediate',
      preferredRole: 'Full-Stack Developer',
      projectInterests: ['Cybersecurity', 'FinTech', 'Smart Cities'],
      collaborationMode: 'Remote',
      completionPct: 95,
    },
  ]);

  const assignSkills = async (userId: string, names: string[]) => {
    const rows = names
      .map((name) => skillMap.get(name))
      .filter((id): id is string => Boolean(id))
      .map((skillId) => ({ userId, skillId, proficiency: 4 }));
    if (rows.length > 0) {
      await db.insert(userSkills).values(rows).onConflictDoNothing();
    }
  };

  await assignSkills(adminUser.id, ['PostgreSQL', 'Node.js', 'NestJS', 'React', 'Docker']);
  await assignSkills(leaderUser.id, ['Node.js', 'PostgreSQL', 'NestJS', 'TypeScript', 'Redis']);
  await assignSkills(p1User.id, ['Python', 'TensorFlow', 'Machine Learning', 'PyTorch', 'Data Analysis']);
  await assignSkills(p2User.id, ['Figma', 'UI/UX', 'Prototyping', 'HTML', 'CSS']);
  await assignSkills(p3User.id, ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Docker']);

  // 4. Seed 25 extra participants (total 30 users!)
  const extraUserIds: Array<{ id: string; role: string; name: string }> = [];
  for (let i = 0; i < EXTRA_PARTICIPANTS.length; i++) {
    const p = EXTRA_PARTICIPANTS[i];
    const [u] = await db
      .insert(users)
      .values({
        uid: `local-seed-p-${i + 4}`,
        email: `builder${i + 4}@hackforge.demo`,
        passwordHash: demoPasswordHash,
        fullName: p.name,
        role: i < 5 ? 'TEAM_LEADER' : 'PARTICIPANT',
        status: 'ACTIVE',
        institution: p.inst,
        location: 'India',
      })
      .returning();

    await db.insert(profiles).values({
      userId: u.id,
      avatarUrl: i % 5 === 0 ? '/src/assets/images/avatar_designer_two_1794634322725.jpg' : '',
      bio: `${p.role} passionate about ${p.cat} systems and collaborative hackathon builds.`,
      experienceLevel: p.exp,
      preferredRole: p.role,
      projectInterests: [p.cat, 'Artificial Intelligence'],
      collaborationMode: p.mode,
      completionPct: 90,
    });

    await assignSkills(u.id, p.skills);
    extraUserIds.push({ id: u.id, role: p.role, name: p.name });
  }

  // 5. Seed 8 Teams
  const teamSpecs = [
    {
      name: 'Team Alpha',
      desc: 'Building an autonomous triage assistant for clinical documentation with real-time inference.',
      category: 'Artificial Intelligence',
      maxCapacity: 5,
      exp: 'Intermediate',
      mode: 'Hybrid',
      leaderId: leaderUser.id,
      secondaryId: null as string | null,
      members: [
        { userId: leaderUser.id, role: 'Backend Developer', isLeader: true },
        { userId: extraUserIds[0].id, role: 'Frontend Developer', isLeader: false },
        { userId: extraUserIds[1].id, role: 'Frontend Developer', isLeader: false },
        { userId: extraUserIds[3].id, role: 'Backend Developer', isLeader: false },
      ],
      reqSkills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Python', 'TensorFlow', 'Figma', 'UI/UX'],
      reqRoles: ['Frontend Developer', 'Backend Developer', 'AI/ML Developer', 'UI/UX Designer', 'Presenter'],
    },
    {
      name: 'MedGrid Diagnostic',
      desc: 'Low-latency rural radiology triage platform with HIPAA-ready audit trails.',
      category: 'Healthcare',
      maxCapacity: 5,
      exp: 'Advanced',
      mode: 'Hybrid',
      leaderId: extraUserIds[4].id,
      secondaryId: extraUserIds[5].id,
      members: [
        { userId: extraUserIds[4].id, role: 'AI/ML Developer', isLeader: true },
        { userId: extraUserIds[5].id, role: 'UI/UX Designer', isLeader: false },
        { userId: extraUserIds[15].id, role: 'Researcher', isLeader: false },
        { userId: extraUserIds[6].id, role: 'Full-Stack Developer', isLeader: false },
        { userId: extraUserIds[2].id, role: 'Backend Developer', isLeader: false },
      ],
      reqSkills: ['Python', 'TensorFlow', 'Figma', 'React', 'PostgreSQL'],
      reqRoles: ['AI/ML Developer', 'UI/UX Designer', 'Backend Developer', 'Full-Stack Developer', 'Researcher'],
    },
    {
      name: 'FinGuard Ledger',
      desc: 'Real-time UPI anomaly detection and merchant settlement verification engine.',
      category: 'FinTech',
      maxCapacity: 5,
      exp: 'Advanced',
      mode: 'On-site',
      leaderId: extraUserIds[6].id,
      secondaryId: extraUserIds[21].id,
      members: [
        { userId: extraUserIds[6].id, role: 'Full-Stack Developer', isLeader: true },
        { userId: extraUserIds[21].id, role: 'Data Analyst', isLeader: false },
        { userId: extraUserIds[17].id, role: 'UI/UX Designer', isLeader: false },
      ],
      reqSkills: ['Node.js', 'PostgreSQL', 'React', 'Python', 'Redis'],
      reqRoles: ['Full-Stack Developer', 'Backend Developer', 'Data Analyst', 'UI/UX Designer'],
    },
    {
      name: 'EcoPulse Grid',
      desc: 'Microgrid load forecasting and carbon credit telemetry dashboard for smart campuses.',
      category: 'Sustainability',
      maxCapacity: 4,
      exp: 'Intermediate',
      mode: 'Hybrid',
      leaderId: extraUserIds[7].id,
      secondaryId: extraUserIds[13].id,
      members: [
        { userId: extraUserIds[7].id, role: 'Data Analyst', isLeader: true },
        { userId: extraUserIds[13].id, role: 'Presenter', isLeader: false },
        { userId: extraUserIds[22].id, role: 'Backend Developer', isLeader: false },
        { userId: extraUserIds[12].id, role: 'Frontend Developer', isLeader: false },
      ],
      reqSkills: ['Python', 'Data Analysis', 'PostgreSQL', 'Node.js', 'Figma'],
      reqRoles: ['Data Analyst', 'Backend Developer', 'Frontend Developer', 'Presenter'],
    },
    {
      name: 'CivicSight AI',
      desc: 'Computer-vision traffic corridor optimization and emergency vehicle green-wave routing.',
      category: 'Smart Cities',
      maxCapacity: 5,
      exp: 'Advanced',
      mode: 'Hybrid',
      leaderId: extraUserIds[11].id,
      secondaryId: extraUserIds[10].id,
      members: [
        { userId: extraUserIds[11].id, role: 'AI/ML Developer', isLeader: true },
        { userId: extraUserIds[10].id, role: 'Full-Stack Developer', isLeader: false },
        { userId: extraUserIds[20].id, role: 'Frontend Developer', isLeader: false },
        { userId: extraUserIds[8].id, role: 'Backend Developer', isLeader: false },
      ],
      reqSkills: ['Python', 'PyTorch', 'React', 'TypeScript', 'Docker', 'Figma'],
      reqRoles: ['AI/ML Developer', 'Full-Stack Developer', 'Frontend Developer', 'UI/UX Designer'],
    },
    {
      name: 'ShieldMesh Zero',
      desc: 'Automated zero-trust API posture scanner and runtime token revocation mesh.',
      category: 'Cybersecurity',
      maxCapacity: 5,
      exp: 'Intermediate',
      mode: 'Remote',
      leaderId: extraUserIds[16].id,
      secondaryId: null,
      members: [
        { userId: extraUserIds[16].id, role: 'Full-Stack Developer', isLeader: true },
        { userId: extraUserIds[24].id, role: 'Full-Stack Developer', isLeader: false },
        { userId: p3User.id, role: 'Full-Stack Developer', isLeader: false },
      ],
      reqSkills: ['TypeScript', 'Node.js', 'Kubernetes', 'PostgreSQL', 'Java'],
      reqRoles: ['Full-Stack Developer', 'Backend Developer', 'AI/ML Developer', 'UI/UX Designer'],
    },
    {
      name: 'EduBridge Adaptive',
      desc: 'Multilingual STEM concept mastery tracker tailored for regional engineering colleges.',
      category: 'Education',
      maxCapacity: 4,
      exp: 'Intermediate',
      mode: 'Flexible',
      leaderId: extraUserIds[9].id,
      secondaryId: extraUserIds[19].id,
      members: [
        { userId: extraUserIds[9].id, role: 'Project Manager', isLeader: true },
        { userId: extraUserIds[19].id, role: 'AI/ML Developer', isLeader: false },
      ],
      reqSkills: ['React', 'Python', 'TensorFlow', 'Figma', 'Node.js'],
      reqRoles: ['Project Manager', 'AI/ML Developer', 'Frontend Developer', 'Backend Developer'],
    },
    {
      name: 'AgriSense Telemetry',
      desc: 'Soil moisture IoT ingestion pipeline with hyperlocal irrigation scheduling.',
      category: 'Agriculture',
      maxCapacity: 5,
      exp: 'Intermediate',
      mode: 'On-site',
      leaderId: extraUserIds[14].id,
      secondaryId: extraUserIds[18].id,
      members: [
        { userId: extraUserIds[14].id, role: 'Backend Developer', isLeader: true },
        { userId: extraUserIds[18].id, role: 'Backend Developer', isLeader: false },
        { userId: extraUserIds[23].id, role: 'Presenter', isLeader: false },
        { userId: p2User.id, role: 'UI/UX Designer', isLeader: false },
        { userId: extraUserIds[17].id, role: 'Frontend Developer', isLeader: false },
      ],
      reqSkills: ['Python', 'PostgreSQL', 'AWS', 'Node.js', 'Figma'],
      reqRoles: ['Backend Developer', 'Presenter', 'UI/UX Designer', 'Frontend Developer'],
    },
  ];

  const createdTeams: Array<{ id: string; name: string }> = [];

  for (const spec of teamSpecs) {
    const [t] = await db
      .insert(teams)
      .values({
        name: spec.name,
        description: spec.desc,
        category: spec.category,
        maxCapacity: spec.maxCapacity,
        experienceRequirement: spec.exp,
        collaborationMode: spec.mode,
        visibility: 'PUBLIC',
        primaryLeaderId: spec.leaderId,
        secondaryLeaderId: spec.secondaryId,
        isTestTeam: false,
        status: 'ACTIVE',
      })
      .returning();

    createdTeams.push({ id: t.id, name: t.name });

    await db.insert(teamRequirements).values({
      teamId: t.id,
      requiredSkills: spec.reqSkills,
      requiredRoles: spec.reqRoles,
      minExperience: spec.exp,
    });

    await db.insert(teamMembers).values(
      spec.members.map((m) => ({
        teamId: t.id,
        userId: m.userId,
        teamRole: m.role,
        isLeader: m.isLeader,
      }))
    );

    await db.insert(leadershipHistory).values({
      teamId: t.id,
      previousLeaderId: null,
      newLeaderId: spec.leaderId,
      action: 'ASSIGN_PRIMARY',
      reason: 'Initial team creator designated as Primary Leader.',
      actorId: spec.leaderId,
    });

    if (spec.secondaryId) {
      await db.insert(leadershipHistory).values({
        teamId: t.id,
        previousLeaderId: null,
        newLeaderId: spec.secondaryId,
        action: 'ASSIGN_SECONDARY',
        reason: 'Secondary leader assigned for succession continuity.',
        actorId: spec.leaderId,
      });
    }

    await recalculateAndPersistTeamHealth(t.id);
  }

  // 6. Seed Pending Invitations & Waitlist Entries for realistic exploration
  const teamAlpha = createdTeams[0];
  const medGrid = createdTeams[1];
  const ecoPulse = createdTeams[3];
  const finGuard = createdTeams[2];

  const expiresLater = new Date(Date.now() + 48 * 60 * 60 * 1000);
  await db.insert(invitations).values([
    {
      teamId: teamAlpha.id,
      userId: p1User.id,
      invitedById: leaderUser.id,
      type: 'INVITE',
      proposedRole: 'AI/ML Developer',
      message: 'Your PyTorch & TensorFlow background directly fills our missing AI/ML seat.',
      status: 'PENDING',
      expiresAt: expiresLater,
    },
    {
      teamId: finGuard.id,
      userId: p1User.id,
      invitedById: extraUserIds[6].id,
      type: 'INVITE',
      proposedRole: 'AI/ML Developer',
      message: 'We need anomaly detection expertise for FinGuard Ledger.',
      status: 'PENDING',
      expiresAt: expiresLater,
    },
  ]);

  await db.insert(waitlistEntries).values([
    {
      teamId: medGrid.id,
      userId: p1User.id,
      queuePosition: 1,
      compatibilityScore: 91.5,
      status: 'WAITING',
    },
    {
      teamId: medGrid.id,
      userId: p3User.id,
      queuePosition: 2,
      compatibilityScore: 76.0,
      status: 'WAITING',
    },
    {
      teamId: ecoPulse.id,
      userId: p2User.id,
      queuePosition: 1,
      compatibilityScore: 84.0,
      status: 'WAITING',
    },
  ]);

  // 7. Seed Notifications & Audit Logs
  await db.insert(notifications).values([
    {
      userId: p1User.id,
      type: 'INVITATION_RECEIVED',
      title: 'Team Alpha invited you',
      message: 'Rohan Kulkarni invited you to join Team Alpha as AI/ML Developer.',
      entityType: 'TEAM',
      entityId: teamAlpha.id,
      isRead: false,
    },
    {
      userId: p1User.id,
      type: 'WAITLIST_JOINED',
      title: 'Waitlist Position #1 for MedGrid Diagnostic',
      message: 'You are #1 in the Smart Waitlist for MedGrid Diagnostic.',
      entityType: 'TEAM',
      entityId: medGrid.id,
      isRead: false,
    },
    {
      userId: leaderUser.id,
      type: 'TEAM_HEALTH_ALERT',
      title: 'Team Alpha Health: 58.1 / 100',
      message: 'Team Alpha is missing AI/ML Developer, UI/UX Designer, and Presenter roles.',
      entityType: 'TEAM',
      entityId: teamAlpha.id,
      isRead: false,
    },
  ]);

  await db.insert(auditLogs).values([
    {
      actorId: adminUser.id,
      action: 'PLATFORM_INITIALIZED',
      entityType: 'SYSTEM',
      entityId: 'hackforge-2026',
      metadata: { seededTeams: createdTeams.length, seededParticipants: 30 },
    },
    {
      actorId: leaderUser.id,
      action: 'TEAM_CREATED',
      entityType: 'TEAM',
      entityId: teamAlpha.id,
      metadata: { teamName: 'Team Alpha', maxCapacity: 5 },
    },
  ]);

  // Pre-calculate compatibility scores for key demo participants across all 8 teams
  for (const demoUser of [p1User, p2User, p3User, leaderUser]) {
    for (const tm of createdTeams) {
      await calculateAndPersistCompatibility(demoUser.id, tm.id);
    }
  }
}

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  import('dotenv/config').then(async () => {
    await runSeed();
    console.log('HackForge database seed completed.');
    process.exit(0);
  });
}

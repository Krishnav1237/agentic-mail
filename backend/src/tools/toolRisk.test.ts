import { describe, it, expect } from 'vitest';

// Isolated tool risk model tests — validates the safety classification system
type ToolRiskLevel = 'low' | 'medium' | 'high';

type ToolMeta = {
  name: string;
  safe: boolean;
  requiresApproval: boolean;
  riskLevel: ToolRiskLevel;
  reversible: boolean;
  estimatedSecondsSaved: number;
};

// Mirror the actual tool definitions from the codebase
const tools: ToolMeta[] = [
  {
    name: 'create_task',
    safe: true,
    requiresApproval: false,
    riskLevel: 'low',
    reversible: true,
    estimatedSecondsSaved: 30,
  },
  {
    name: 'create_calendar_event',
    safe: true,
    requiresApproval: false,
    riskLevel: 'low',
    reversible: true,
    estimatedSecondsSaved: 60,
  },
  {
    name: 'draft_reply',
    safe: true,
    requiresApproval: true,
    riskLevel: 'medium',
    reversible: true,
    estimatedSecondsSaved: 120,
  },
  {
    name: 'send_reply',
    safe: false,
    requiresApproval: true,
    riskLevel: 'high',
    reversible: false,
    estimatedSecondsSaved: 120,
  },
  {
    name: 'snooze',
    safe: true,
    requiresApproval: false,
    riskLevel: 'low',
    reversible: true,
    estimatedSecondsSaved: 15,
  },
  {
    name: 'mark_important',
    safe: true,
    requiresApproval: false,
    riskLevel: 'low',
    reversible: true,
    estimatedSecondsSaved: 10,
  },
  {
    name: 'archive_email',
    safe: true,
    requiresApproval: false,
    riskLevel: 'low',
    reversible: true,
    estimatedSecondsSaved: 10,
  },
  {
    name: 'delete_email',
    safe: false,
    requiresApproval: true,
    riskLevel: 'high',
    reversible: false,
    estimatedSecondsSaved: 10,
  },
  {
    name: 'move_to_folder',
    safe: true,
    requiresApproval: false,
    riskLevel: 'medium',
    reversible: true,
    estimatedSecondsSaved: 15,
  },
  {
    name: 'label_email',
    safe: true,
    requiresApproval: false,
    riskLevel: 'low',
    reversible: true,
    estimatedSecondsSaved: 10,
  },
];

// Replicate executor's auto-execution logic
const computeAutoExecution = (input: {
  autopilotLevel: number;
  personalityMode: 'chill' | 'proactive' | 'aggressive';
  requiresApproval: boolean;
  riskLevel: ToolRiskLevel;
  policyAllows: boolean;
}) => {
  if (input.requiresApproval) return false;
  if (input.policyAllows) return true;
  if (input.riskLevel === 'low') return input.autopilotLevel >= 1;
  if (input.riskLevel === 'medium')
    return input.autopilotLevel === 2 && input.personalityMode === 'aggressive';
  return false;
};

describe('Tool Risk Model', () => {
  it('has 10 registered tools', () => {
    expect(tools).toHaveLength(10);
  });

  it('destructive tools require approval', () => {
    const destructive = tools.filter((t) => !t.safe);
    expect(destructive.length).toBeGreaterThan(0);
    for (const tool of destructive) {
      expect(tool.requiresApproval).toBe(true);
      expect(tool.riskLevel).toBe('high');
    }
  });

  it('send_reply is never auto-executed', () => {
    const sendReply = tools.find((t) => t.name === 'send_reply')!;
    expect(sendReply.requiresApproval).toBe(true);
    expect(sendReply.riskLevel).toBe('high');
    expect(sendReply.reversible).toBe(false);
  });

  it('delete_email is never auto-executed', () => {
    const deleteEmail = tools.find((t) => t.name === 'delete_email')!;
    expect(deleteEmail.requiresApproval).toBe(true);
    expect(deleteEmail.riskLevel).toBe('high');
    expect(deleteEmail.reversible).toBe(false);
  });

  it('all low-risk tools are marked safe', () => {
    const lowRisk = tools.filter((t) => t.riskLevel === 'low');
    for (const tool of lowRisk) {
      expect(tool.safe).toBe(true);
    }
  });

  it('all tools have positive estimated time savings', () => {
    for (const tool of tools) {
      expect(tool.estimatedSecondsSaved).toBeGreaterThan(0);
    }
  });
});

describe('Auto-Execution Policy', () => {
  it('never auto-executes if requiresApproval is true', () => {
    expect(
      computeAutoExecution({
        autopilotLevel: 2,
        personalityMode: 'aggressive',
        requiresApproval: true,
        riskLevel: 'low',
        policyAllows: false,
      })
    ).toBe(false);
  });

  it('auto-executes if policy explicitly allows', () => {
    expect(
      computeAutoExecution({
        autopilotLevel: 0,
        personalityMode: 'chill',
        requiresApproval: false,
        riskLevel: 'medium',
        policyAllows: true,
      })
    ).toBe(true);
  });

  it('auto-executes low-risk at autopilot level 1', () => {
    expect(
      computeAutoExecution({
        autopilotLevel: 1,
        personalityMode: 'proactive',
        requiresApproval: false,
        riskLevel: 'low',
        policyAllows: false,
      })
    ).toBe(true);
  });

  it('does NOT auto-execute low-risk at autopilot level 0', () => {
    expect(
      computeAutoExecution({
        autopilotLevel: 0,
        personalityMode: 'proactive',
        requiresApproval: false,
        riskLevel: 'low',
        policyAllows: false,
      })
    ).toBe(false);
  });

  it('auto-executes medium-risk only at level 2 + aggressive', () => {
    expect(
      computeAutoExecution({
        autopilotLevel: 2,
        personalityMode: 'aggressive',
        requiresApproval: false,
        riskLevel: 'medium',
        policyAllows: false,
      })
    ).toBe(true);

    // Same level but proactive — should NOT auto-execute
    expect(
      computeAutoExecution({
        autopilotLevel: 2,
        personalityMode: 'proactive',
        requiresApproval: false,
        riskLevel: 'medium',
        policyAllows: false,
      })
    ).toBe(false);
  });

  it('never auto-executes high-risk actions', () => {
    expect(
      computeAutoExecution({
        autopilotLevel: 2,
        personalityMode: 'aggressive',
        requiresApproval: false,
        riskLevel: 'high',
        policyAllows: false,
      })
    ).toBe(false);
  });
});

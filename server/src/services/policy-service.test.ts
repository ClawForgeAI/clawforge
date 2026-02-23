/**
 * Unit tests for PolicyService.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PolicyService } from "./policy-service.js";
import {
  TEST_ORG_ID,
  TEST_USER_ID,
  testPolicy,
} from "../test/helpers.js";

// ---------------------------------------------------------------------------
// Mock DB helper specific to PolicyService
// ---------------------------------------------------------------------------

function createPolicyMockDb() {
  // We need a chainable mock that lets us control what each query returns.
  let selectResult: unknown[] = [];
  let insertResult: unknown[] = [];
  let updateResult: unknown[] = [];

  function chain(resultRef: () => unknown[]) {
    const obj: Record<string, unknown> = {};
    const methods = [
      "from",
      "where",
      "limit",
      "offset",
      "orderBy",
      "values",
      "set",
      "returning",
      "onConflictDoUpdate",
    ];
    for (const m of methods) {
      obj[m] = vi.fn().mockReturnValue(obj);
    }
    // Make thenable
    obj.then = vi.fn((resolve: (v: unknown) => void) => resolve(resultRef()));
    return obj;
  }

  const db = {
    select: vi.fn(() => chain(() => selectResult)),
    insert: vi.fn(() => chain(() => insertResult)),
    update: vi.fn(() => chain(() => updateResult)),
    delete: vi.fn(() => chain(() => [])),
    _setSelectResult(val: unknown[]) {
      selectResult = val;
    },
    _setInsertResult(val: unknown[]) {
      insertResult = val;
    },
    _setUpdateResult(val: unknown[]) {
      updateResult = val;
    },
  };

  return db;
}

describe("PolicyService", () => {
  let db: ReturnType<typeof createPolicyMockDb>;
  let service: PolicyService;

  beforeEach(() => {
    db = createPolicyMockDb();
    service = new PolicyService(db as unknown as ConstructorParameters<typeof PolicyService>[0]);
  });

  // -------------------------------------------------------------------------
  // getEffectivePolicy
  // -------------------------------------------------------------------------

  describe("getEffectivePolicy", () => {
    it("returns null when no policy exists for the org", async () => {
      db._setSelectResult([]);

      const result = await service.getEffectivePolicy(TEST_ORG_ID, TEST_USER_ID);
      expect(result).toBeNull();
    });

    it("returns an effective policy with org-wide approved skills", async () => {
      // First select: policy query
      // Second select: approved skills query
      // We need to handle two sequential selects returning different values.
      let callCount = 0;
      const policyRow = { ...testPolicy };
      const approvedSkillRows = [
        {
          id: "skill-1",
          orgId: TEST_ORG_ID,
          skillName: "MySkill",
          skillKey: "my-skill",
          scope: "org",
          approvedForUser: null,
          version: 1,
          revokedAt: null,
          revokedBy: null,
          createdAt: new Date(),
        },
      ];

      db.select = vi.fn(() => {
        callCount++;
        const results = callCount === 1 ? [policyRow] : approvedSkillRows;
        const obj: Record<string, unknown> = {};
        const methods = ["from", "where", "limit", "offset", "orderBy"];
        for (const m of methods) {
          obj[m] = vi.fn().mockReturnValue(obj);
        }
        obj.then = vi.fn((resolve: (v: unknown) => void) => resolve(results));
        return obj;
      });

      const result = await service.getEffectivePolicy(TEST_ORG_ID, TEST_USER_ID);

      expect(result).not.toBeNull();
      expect(result!.version).toBe(1);
      expect(result!.tools).toEqual({ allow: ["Read", "Write"], deny: ["Bash"] });
      expect(result!.skills.requireApproval).toBe(true);
      expect(result!.skills.approved).toHaveLength(1);
      expect(result!.skills.approved[0]).toEqual({
        name: "MySkill",
        key: "my-skill",
        scope: "org",
      });
      expect(result!.killSwitch.active).toBe(false);
      expect(result!.auditLevel).toBe("metadata");
    });

    it("filters user-specific skills to the requesting user", async () => {
      let callCount = 0;
      const policyRow = { ...testPolicy };
      const approvedSkillRows = [
        {
          id: "skill-1",
          orgId: TEST_ORG_ID,
          skillName: "OrgSkill",
          skillKey: "org-skill",
          scope: "org",
          approvedForUser: null,
          version: 1,
          revokedAt: null,
          revokedBy: null,
          createdAt: new Date(),
        },
        {
          id: "skill-2",
          orgId: TEST_ORG_ID,
          skillName: "UserSkill",
          skillKey: "user-skill",
          scope: "self",
          approvedForUser: TEST_USER_ID,
          version: 1,
          revokedAt: null,
          revokedBy: null,
          createdAt: new Date(),
        },
        {
          id: "skill-3",
          orgId: TEST_ORG_ID,
          skillName: "OtherUserSkill",
          skillKey: "other-user-skill",
          scope: "self",
          approvedForUser: "another-user-id",
          version: 1,
          revokedAt: null,
          revokedBy: null,
          createdAt: new Date(),
        },
      ];

      db.select = vi.fn(() => {
        callCount++;
        const results = callCount === 1 ? [policyRow] : approvedSkillRows;
        const obj: Record<string, unknown> = {};
        const methods = ["from", "where", "limit", "offset", "orderBy"];
        for (const m of methods) {
          obj[m] = vi.fn().mockReturnValue(obj);
        }
        obj.then = vi.fn((resolve: (v: unknown) => void) => resolve(results));
        return obj;
      });

      const result = await service.getEffectivePolicy(TEST_ORG_ID, TEST_USER_ID);

      // Should include org skill + user's own self skill, but NOT other user's skill
      expect(result!.skills.approved).toHaveLength(2);
      expect(result!.skills.approved.map((s) => s.key)).toEqual(["org-skill", "user-skill"]);
    });
  });

  // -------------------------------------------------------------------------
  // upsertOrgPolicy
  // -------------------------------------------------------------------------

  describe("upsertOrgPolicy", () => {
    it("creates a new policy when none exists", async () => {
      const newPolicy = {
        ...testPolicy,
        auditLevel: "full" as const,
      };

      // getOrgPolicy (select) returns empty, then insert returns the new row
      let callCount = 0;
      db.select = vi.fn(() => {
        const obj: Record<string, unknown> = {};
        const methods = ["from", "where", "limit"];
        for (const m of methods) {
          obj[m] = vi.fn().mockReturnValue(obj);
        }
        obj.then = vi.fn((resolve: (v: unknown) => void) => resolve([]));
        return obj;
      });
      db._setInsertResult([newPolicy]);

      const result = await service.upsertOrgPolicy(TEST_ORG_ID, {
        auditLevel: "full",
      });

      expect(result).toEqual(newPolicy);
      expect(db.insert).toHaveBeenCalled();
    });

    it("updates an existing policy and increments version", async () => {
      const updatedPolicy = { ...testPolicy, version: 2, auditLevel: "full" as const };

      // getOrgPolicy returns existing
      db.select = vi.fn(() => {
        const obj: Record<string, unknown> = {};
        const methods = ["from", "where", "limit"];
        for (const m of methods) {
          obj[m] = vi.fn().mockReturnValue(obj);
        }
        obj.then = vi.fn((resolve: (v: unknown) => void) => resolve([testPolicy]));
        return obj;
      });
      db._setUpdateResult([updatedPolicy]);

      const result = await service.upsertOrgPolicy(TEST_ORG_ID, {
        auditLevel: "full",
      });

      expect(result).toEqual(updatedPolicy);
      expect(db.update).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // setKillSwitch
  // -------------------------------------------------------------------------

  describe("setKillSwitch", () => {
    it("creates a policy with kill switch active when none exists", async () => {
      const created = { ...testPolicy, killSwitch: true, killSwitchMessage: "Emergency!" };

      db.select = vi.fn(() => {
        const obj: Record<string, unknown> = {};
        const methods = ["from", "where", "limit"];
        for (const m of methods) {
          obj[m] = vi.fn().mockReturnValue(obj);
        }
        obj.then = vi.fn((resolve: (v: unknown) => void) => resolve([]));
        return obj;
      });
      db._setInsertResult([created]);

      const result = await service.setKillSwitch(TEST_ORG_ID, true, "Emergency!");

      expect(result).toEqual(created);
      expect(db.insert).toHaveBeenCalled();
    });

    it("updates kill switch on an existing policy", async () => {
      const updated = { ...testPolicy, killSwitch: true, killSwitchMessage: "Stop!", version: 2 };

      db.select = vi.fn(() => {
        const obj: Record<string, unknown> = {};
        const methods = ["from", "where", "limit"];
        for (const m of methods) {
          obj[m] = vi.fn().mockReturnValue(obj);
        }
        obj.then = vi.fn((resolve: (v: unknown) => void) => resolve([testPolicy]));
        return obj;
      });
      db._setUpdateResult([updated]);

      const result = await service.setKillSwitch(TEST_ORG_ID, true, "Stop!");

      expect(result).toEqual(updated);
      expect(db.update).toHaveBeenCalled();
    });

    it("deactivates kill switch", async () => {
      const existing = { ...testPolicy, killSwitch: true, killSwitchMessage: "Stop!" };
      const updated = { ...existing, killSwitch: false, killSwitchMessage: null, version: 2 };

      db.select = vi.fn(() => {
        const obj: Record<string, unknown> = {};
        const methods = ["from", "where", "limit"];
        for (const m of methods) {
          obj[m] = vi.fn().mockReturnValue(obj);
        }
        obj.then = vi.fn((resolve: (v: unknown) => void) => resolve([existing]));
        return obj;
      });
      db._setUpdateResult([updated]);

      const result = await service.setKillSwitch(TEST_ORG_ID, false);

      expect(result).toEqual(updated);
      expect(result.killSwitch).toBe(false);
    });
  });
});

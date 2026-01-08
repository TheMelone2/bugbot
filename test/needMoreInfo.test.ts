import { describe, it, expect } from "vitest";
import { handleNeedMoreInfo } from "../src/sessions/BugReportSessionManager.js";
import { NeedMoreInfoError } from "../src/ai/errors.js";

describe("handleNeedMoreInfo", () => {
  it("asks for a new missing field and updates session state", () => {
    const session: any = {
      summary: "Messages not loading on mobile",
      steps: ["Open app"],
      detailedDescription: "Messages don't show on mobile",
      askedFields: [],
      repromptCount: 0,
    };

    const err = new NeedMoreInfoError(["appVersion"], "need app version");
    const res = handleNeedMoreInfo(session, err);
    expect(res.endSession).toBe(false);
    expect(res.message).toContain("appVersion");
    expect(session.askedFields).toContain("appVersion");
    expect(session.missingFields).toContain("appVersion");
  });

  it("returns a generic clarification when the model repeats same request and increments repromptCount", () => {
    const session: any = {
      summary: "S",
      steps: [],
      detailedDescription: "D",
      askedFields: ["appVersion"],
      repromptCount: 0,
    };
    const err = new NeedMoreInfoError(["appVersion"], "again");
    const res = handleNeedMoreInfo(session, err);
    expect(res.endSession).toBe(false);
    expect(res.message).toContain("Could you clarify");
    expect(session.repromptCount).toBe(1);
  });

  it("provides a template and ends the session after repeated repeats", () => {
    const session: any = {
      summary: "S",
      steps: ["1"],
      detailedDescription: "D",
      askedFields: ["appVersion"],
      repromptCount: 3,
    };
    const err = new NeedMoreInfoError(["appVersion"], "again");
    const res = handleNeedMoreInfo(session, err);
    expect(res.endSession).toBe(true);
    expect(res.message).toContain("**Template:**");
  });
});

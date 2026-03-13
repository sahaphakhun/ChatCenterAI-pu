const moment = require("moment-timezone");

const DEFAULT_TIMEZONE = "Asia/Bangkok";
const DEFAULT_INTERVAL_MS = 60 * 1000;

class AgentForgeScheduler {
  constructor(options = {}) {
    this.agentForgeService = options.agentForgeService;
    this.agentForgeRunner = options.agentForgeRunner;
    this.timezone = options.timezone || DEFAULT_TIMEZONE;
    this.intervalMs = Number(options.intervalMs) || DEFAULT_INTERVAL_MS;
    this.timer = null;
    this.lastTriggeredDate = null;
    this.isRunning = false;
  }

  start() {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      this._tick().catch((error) => {
        console.error("[AgentForgeScheduler] Tick error:", error);
      });
    }, this.intervalMs);

    // run one initial tick after boot
    this._tick().catch((error) => {
      console.error("[AgentForgeScheduler] Initial tick error:", error);
    });
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async processNow(agentId, options = {}, userContext = {}) {
    return this.agentForgeRunner.startRun(
      agentId,
      {
        runType: "manual",
        dryRun: !!options.dryRun,
      },
      userContext,
    );
  }

  async _tick() {
    if (this.isRunning) return;

    const now = moment().tz(this.timezone);
    const dateStr = now.format("YYYY-MM-DD");

    // default schedule: every day at 00:00 timezone (allow first 10 minutes window)
    const inScheduleWindow = now.hour() === 0 && now.minute() < 10;
    if (!inScheduleWindow) {
      return;
    }

    if (this.lastTriggeredDate === dateStr) {
      return;
    }

    this.isRunning = true;
    try {
      await this._triggerScheduledRuns(dateStr);
      this.lastTriggeredDate = dateStr;
    } finally {
      this.isRunning = false;
    }
  }

  async _triggerScheduledRuns(dateStr) {
    const dueAgents = await this.agentForgeService.listAgentsDueForSchedule(dateStr);
    if (!Array.isArray(dueAgents) || dueAgents.length === 0) {
      return [];
    }

    const startedRuns = [];

    for (const agent of dueAgents) {
      try {
        const run = await this.agentForgeRunner.startRun(
          agent._id,
          {
            runType: "scheduled",
            dryRun: false,
            scheduledFor: moment.tz(dateStr, "YYYY-MM-DD", this.timezone).toDate(),
          },
          {
            username: "agent_forge_scheduler",
            role: "system",
          },
        );

        startedRuns.push({
          agentId: agent._id,
          runId: run._id,
        });

        await this.agentForgeService.markScheduledRunDate(agent._id, dateStr);
      } catch (error) {
        console.error(
          `[AgentForgeScheduler] Schedule run failed for agent ${agent._id}:`,
          error?.message || error,
        );
      }
    }

    return startedRuns;
  }
}

module.exports = {
  AgentForgeScheduler,
};

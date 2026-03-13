const express = require("express");

function createAgentForgeAdminRouter(options = {}) {
  const {
    requireAdmin,
    agentForgeService,
  } = options;

  if (!requireAdmin) throw new Error("requireAdmin_required");
  if (!agentForgeService) throw new Error("agentForgeService_required");

  const router = express.Router();
  router.use(requireAdmin);

  router.get("/", async (req, res) => {
    try {
      const [agents, pages, instructions, instructionUsageMap, customerModelOptions] = await Promise.all([
        agentForgeService.listAgents(),
        agentForgeService.listManagedPages(),
        agentForgeService.listInstructionOptions(),
        agentForgeService.getInstructionUsageMap(),
        Promise.resolve(agentForgeService.getCustomerModelOptions()),
      ]);

      res.render("admin-agent-forge", {
        activePage: "agent-forge",
        agents,
        managedPages: pages,
        instructions,
        instructionUsageMap,
        customerModelOptions,
      });
    } catch (error) {
      console.error("[AgentForgeAdmin] render error:", error);
      res.status(500).send("ไม่สามารถโหลดหน้า Agent Forge ได้");
    }
  });

  router.get("/runs/:runId", async (req, res) => {
    try {
      const run = await agentForgeService.getRunById(req.params.runId);
      if (!run) {
        return res.status(404).send("ไม่พบ run ที่ต้องการ");
      }

      res.render("admin-agent-forge-run", {
        activePage: "agent-forge",
        run,
      });
    } catch (error) {
      console.error("[AgentForgeAdmin] run page error:", error);
      res.status(500).send("ไม่สามารถโหลดหน้า run ได้");
    }
  });

  return router;
}

module.exports = createAgentForgeAdminRouter;

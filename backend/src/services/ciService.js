import { GitHubService, DEFAULT_OWNER, DEFAULT_REPO } from "./githubService.js";
import { recordAudit } from "../middleware/auditLogger.js";

/**
 * Real CI/CD Pipeline Automation Service (Chapter 5.1.4 & Chapter 6.3.2 TC002)
 * Bridges directly to Real GitHub Actions REST API for live cloud builds, stages, and logs,
 * with polling status updates and WebSocket emissions, while maintaining a local simulation fallback.
 */

let activePipelines = [
  {
    id: "pipe-101",
    name: "production-release-workflow",
    branch: "main",
    commit: "7f9a2c1",
    commitMsg: "feat(auth): add OAuth2 and MFA verification",
    status: "success",
    duration: "2m 14s",
    source: "SIMULATED",
    triggeredAt: new Date(Date.now() - 3600000).toISOString(),
    stages: [
      { name: "Code Checkout", status: "success", duration: "4s", logs: "Fetched 14 files at commit 7f9a2c1" },
      { name: "Static Linting", status: "success", duration: "12s", logs: "ESLint passed: 0 warnings, 0 errors." },
      { name: "Unit Tests", status: "success", duration: "28s", logs: "Jest: 28/28 tests passed (100% coverage)." },
      { name: "Security Audit", status: "success", duration: "15s", logs: "npm audit: 0 vulnerabilities found." },
      { name: "Docker Container Build", status: "success", duration: "45s", logs: "Tagged image registry.internal/app:v2.1" },
      { name: "Kubernetes Rolling Deploy", status: "success", duration: "30s", logs: "Deployment roll-out successfully finished." }
    ]
  },
  {
    id: "pipe-102",
    name: "staging-integration-test",
    branch: "develop",
    commit: "3b4d1e9",
    commitMsg: "refactor(api): database pooling update",
    status: "failed",
    duration: "1m 02s",
    source: "SIMULATED",
    triggeredAt: new Date(Date.now() - 14400000).toISOString(),
    stages: [
      { name: "Code Checkout", status: "success", duration: "3s", logs: "Fetched 22 files" },
      { name: "Static Linting", status: "success", duration: "10s", logs: "Lint check passed" },
      { name: "Unit Tests", status: "failed", duration: "49s", logs: "Error: DB connection timeout at pool.connect()" },
      { name: "Security Audit", status: "skipped", duration: "0s", logs: "Skipped due to upstream failure" },
      { name: "Docker Container Build", status: "skipped", duration: "0s", logs: "Skipped" },
      { name: "Kubernetes Rolling Deploy", status: "skipped", duration: "0s", logs: "Skipped" }
    ]
  }
];

export class CIService {
  /**
   * Retrieve pipelines list - merges real GitHub Actions runs with simulation sandbox
   */
  static async getPipelines(mode = "auto", reqToken = null, owner = DEFAULT_OWNER, repo = DEFAULT_REPO) {
    if (mode === "simulated") {
      return { isLive: false, mode: "simulated", pipelines: activePipelines };
    }

    // Try fetching real GitHub Actions runs
    try {
      const realRunsData = await GitHubService.getWorkflowRuns(owner, repo, reqToken);
      if (realRunsData.isLive && realRunsData.runs.length > 0) {
        const livePipelines = realRunsData.runs.map((r) => {
          // Check if we have an in-memory tracked instance with detailed stages
          const existing = activePipelines.find((p) => p.id === String(r.id) || p.realRunId === r.id);
          return {
            id: String(r.id),
            name: r.name,
            branch: r.headBranch,
            commit: r.headSha,
            commitMsg: r.displayTitle,
            status: r.status === "completed" ? (r.conclusion === "success" ? "success" : "failed") : "running",
            rawStatus: r.status,
            rawConclusion: r.conclusion,
            author: r.author,
            authorAvatar: r.authorAvatar,
            duration: r.status === "completed" ? "Completed" : "Running...",
            triggeredAt: r.createdAt,
            htmlUrl: r.htmlUrl,
            runNumber: r.runNumber,
            source: "GITHUB_ACTIONS",
            owner,
            repo,
            stages: existing?.stages || [
              { name: "1. Code Checkout", status: r.status === "completed" ? "success" : "running", duration: "-" },
              { name: "2. Set up Node.js Runtime", status: r.status === "completed" ? "success" : "pending", duration: "-" },
              { name: "3. Install Backend Dependencies", status: r.status === "completed" ? "success" : "pending", duration: "-" },
              { name: "4. Run Evaluation Benchmark Tests", status: r.status === "completed" ? "success" : "pending", duration: "-" },
              { name: "5. Install Frontend Dependencies", status: r.status === "completed" ? "success" : "pending", duration: "-" },
              { name: "6. Build Frontend Production Bundle", status: r.status === "completed" ? "success" : "pending", duration: "-" },
              { name: "7. Container & DevSecOps Validation", status: r.status === "completed" ? "success" : "pending", duration: "-" },
              { name: "8. Pipeline Success Notification", status: r.status === "completed" ? "success" : "pending", duration: "-" }
            ]
          };
        });

        // Prepend any currently pending/polling runs not yet listed by GitHub API
        const pendingRuns = activePipelines.filter(
          (p) => p.source === "GITHUB_ACTIONS" && p.id.startsWith("gh-pending-")
        );

        return {
          isLive: true,
          mode: "real",
          owner,
          repo,
          pipelines: [...pendingRuns, ...livePipelines]
        };
      }
    } catch (err) {
      console.warn("Real GitHub Actions fetch failed:", err.message);
    }

    return {
      isLive: false,
      mode: "simulated",
      owner,
      repo,
      pipelines: activePipelines
    };
  }

  /**
   * Fetch real jobs and steps for a specific pipeline run
   */
  static async getRunJobs(runId, reqToken = null, owner = DEFAULT_OWNER, repo = DEFAULT_REPO) {
    // Check if it's a simulated run
    const sim = activePipelines.find((p) => p.id === runId);
    if (sim && sim.source === "SIMULATED") {
      return {
        isLive: false,
        runId,
        jobs: [{
          id: sim.id,
          name: sim.name,
          status: sim.status,
          steps: sim.stages.map((s, idx) => ({
            number: idx + 1,
            name: s.name,
            status: s.status === "success" ? "completed" : s.status,
            conclusion: s.status,
            duration: s.duration,
            logs: s.logs
          }))
        }]
      };
    }

    // Fetch real GitHub Actions jobs and steps
    const jobs = await GitHubService.getRunJobs(owner, repo, runId, reqToken);
    return {
      isLive: true,
      runId,
      owner,
      repo,
      jobs
    };
  }

  /**
   * Fetch real raw terminal logs for a job
   */
  static async getJobLogs(jobId, reqToken = null, owner = DEFAULT_OWNER, repo = DEFAULT_REPO) {
    // Check if it's simulated
    const sim = activePipelines.find((p) => p.id === jobId);
    if (sim && sim.source === "SIMULATED") {
      return sim.stages.map((s) => `[${s.status.toUpperCase()}] ${s.name} (${s.duration})\n  ${s.logs}`).join("\n\n");
    }

    return await GitHubService.getJobLogs(owner, repo, jobId, reqToken);
  }

  /**
   * Trigger a pipeline - Real GitHub Actions cloud execution with REST API dispatch,
   * live polling, and WebSocket streaming to the UI.
   */
  static async triggerPipeline(pipelineName = "smart-devops-ci", io = null, reqToken = null, options = {}) {
    const mode = options.mode || "auto";
    const owner = options.owner || DEFAULT_OWNER;
    const repo = options.repo || DEFAULT_REPO;
    const ref = options.ref || "main";
    const workflowId = options.workflowId || "ci.yml";

    const token = GitHubService.getToken(reqToken);

    // Fast-path for unit tests and local simulation sandbox
    const isExplicitSimulated = mode === "simulated" || pipelineName === "automated-test-run";

    if (!isExplicitSimulated && token) {
      console.log(`🚀 [Real CI/CD] Dispatching GitHub Actions workflow '${workflowId}' on '${owner}/${repo}' (ref: '${ref}')...`);
      const dispatchTimestamp = Date.now();

      // Step 3: Trigger via GitHub REST API (Create workflow dispatch event)
      const dispatchResult = await GitHubService.triggerWorkflowDispatch(owner, repo, workflowId, ref, token);

      if (dispatchResult.success) {
        const tempId = `gh-pending-${Date.now().toString().slice(-4)}`;
        const livePipeline = {
          id: tempId,
          realRunId: null,
          name: pipelineName || "Smart DevOps Assistant CI/CD Pipeline",
          branch: ref,
          commit: "HEAD",
          commitMsg: `Dispatched to ${owner}/${repo} via GitHub Actions API`,
          status: "running",
          rawStatus: "queued",
          rawConclusion: null,
          duration: "Queued on GitHub...",
          source: "GITHUB_ACTIONS",
          owner,
          repo,
          workflowId,
          triggeredAt: new Date().toISOString(),
          stages: [
            { name: "1. Code Checkout", status: "running", duration: "...", logs: "GitHub Actions runner allocating..." },
            { name: "2. Set up Node.js Runtime", status: "pending", duration: "-", logs: "" },
            { name: "3. Install Backend Dependencies", status: "pending", duration: "-", logs: "" },
            { name: "4. Run Evaluation Benchmark Tests (TC001-TC009)", status: "pending", duration: "-", logs: "" },
            { name: "5. Install Frontend Dependencies", status: "pending", duration: "-", logs: "" },
            { name: "6. Build Frontend Production Bundle", status: "pending", duration: "-", logs: "" },
            { name: "7. Container & DevSecOps Validation", status: "pending", duration: "-", logs: "" },
            { name: "8. Pipeline Success Notification", status: "pending", duration: "-", logs: "" }
          ]
        };

        activePipelines.unshift(livePipeline);

        // Step 5: Initial WebSocket emission to React frontend
        if (io) {
          io.emit("ci_pipeline_update", livePipeline);
        }

        // Step 4 & 5: Polling loop in background
        this.startGitHubRunPoller(livePipeline, owner, repo, workflowId, ref, token, io, dispatchTimestamp);

        return livePipeline;
      } else {
        console.warn("⚠️ GitHub Actions dispatch failed, falling back to simulated pipeline:", dispatchResult.message);
      }
    }

    // Fallback: Local simulated runner (for unit tests like TC002 or offline use)
    return this.runSimulatedPipeline(pipelineName, io);
  }

  /**
   * Polling loop for Real GitHub Actions cloud execution (Step 4 & Step 5)
   */
  static startGitHubRunPoller(livePipeline, owner, repo, workflowId, ref, token, io, dispatchTimestamp) {
    let pollCount = 0;
    const maxPolls = 120; // 120 * 3.5s = ~7 minutes max
    let foundRealRun = false;

    console.log(`🔄 [CI Poller] Started background polling for run on ${owner}/${repo}...`);

    const pollInterval = setInterval(async () => {
      pollCount++;
      if (pollCount > maxPolls) {
        clearInterval(pollInterval);
        console.warn(`⚠️ [CI Poller] Timed out waiting for GitHub Actions run completion.`);
        return;
      }

      try {
        // Step 4A: Find the newly created workflow run on GitHub
        if (!foundRealRun) {
          const runsData = await GitHubService.getWorkflowRuns(owner, repo, token);
          if (runsData.isLive && runsData.runs.length > 0) {
            // Find the run created around or after our dispatch timestamp
            const recentRun = runsData.runs.find((r) => {
              const runTime = new Date(r.createdAt).getTime();
              return runTime >= dispatchTimestamp - 45000;
            }) || (runsData.runs[0]?.event === "workflow_dispatch" ? runsData.runs[0] : null);

            if (recentRun) {
              foundRealRun = true;
              livePipeline.realRunId = recentRun.id;
              livePipeline.id = String(recentRun.id);
              livePipeline.runNumber = recentRun.runNumber;
              livePipeline.htmlUrl = recentRun.htmlUrl;
              livePipeline.commit = recentRun.headSha;
              livePipeline.commitMsg = recentRun.displayTitle || livePipeline.commitMsg;
              livePipeline.rawStatus = recentRun.status;
              livePipeline.rawConclusion = recentRun.conclusion;

              // Replace temporary id in memory list
              const pIdx = activePipelines.findIndex((p) => p.id === livePipeline.id || p.id.startsWith("gh-pending-"));
              if (pIdx >= 0) {
                activePipelines[pIdx] = livePipeline;
              }

              console.log(`🎯 [CI Poller] Located real GitHub Actions run #${recentRun.runNumber} (ID: ${recentRun.id}, Status: ${recentRun.status})`);
              if (io) io.emit("ci_pipeline_update", livePipeline);
            }
          }
        }

        // Step 4B & 5: If real run is located, poll its jobs, steps, and emit WebSocket updates
        if (livePipeline.realRunId) {
          const jobs = await GitHubService.getRunJobs(owner, repo, livePipeline.realRunId, token);
          if (jobs && jobs.length > 0) {
            const mainJob = jobs[0];
            const allSteps = mainJob.steps || [];

            // Filter out GitHub-internal steps to display user-relevant pipeline stages cleanly
            const userSteps = allSteps.filter((s) =>
              !s.name.startsWith("Post ") && s.name !== "Set up job" && s.name !== "Complete job"
            );
            const displaySteps = userSteps.length > 0 ? userSteps : allSteps;

            if (displaySteps.length > 0) {
              livePipeline.stages = displaySteps.map((s, idx) => {
                let stageStatus = "pending";
                if (s.status === "in_progress") stageStatus = "running";
                else if (s.status === "completed") {
                  stageStatus = s.conclusion === "success" ? "success" : s.conclusion === "skipped" ? "skipped" : "failed";
                }

                let duration = "-";
                if (s.startedAt && s.completedAt) {
                  const diffSecs = Math.max(1, Math.round((new Date(s.completedAt) - new Date(s.startedAt)) / 1000));
                  duration = `${diffSecs}s`;
                } else if (stageStatus === "running") {
                  duration = "running...";
                }

                return {
                  name: s.name,
                  status: stageStatus,
                  duration,
                  logs: `GitHub Actions runner step: ${s.name} [Status: ${s.status}${s.conclusion ? ` (${s.conclusion})` : ""}]`
                };
              });
            }

            livePipeline.rawStatus = mainJob.status;
            livePipeline.rawConclusion = mainJob.conclusion;

            if (mainJob.status === "completed") {
              livePipeline.status = mainJob.conclusion === "success" ? "success" : "failed";
              livePipeline.duration = "Completed";

              // Fetch final runner terminal logs
              try {
                const runnerLogs = await GitHubService.getJobLogs(owner, repo, mainJob.id, token);
                livePipeline.terminalLogs = runnerLogs;
                if (io) {
                  io.emit("ci_pipeline_logs", { runId: livePipeline.id, jobId: mainJob.id, logs: runnerLogs });
                }
              } catch (e) {
                console.warn("[CI Poller] Failed to fetch final runner logs:", e.message);
              }

              // Emit final completion event
              if (io) {
                io.emit("ci_pipeline_update", livePipeline);
                io.emit("ci_pipeline_completed", {
                  id: livePipeline.id,
                  runNumber: livePipeline.runNumber,
                  status: livePipeline.status,
                  conclusion: mainJob.conclusion,
                  htmlUrl: livePipeline.htmlUrl
                });
              }

              clearInterval(pollInterval);
              console.log(`✅ [CI Poller] GitHub Actions run #${livePipeline.runNumber || livePipeline.id} finished with status: ${livePipeline.status}`);
              return;
            } else {
              livePipeline.status = "running";
              livePipeline.duration = "Running in cloud runner...";
              if (io) io.emit("ci_pipeline_update", livePipeline);
            }
          }
        }
      } catch (err) {
        console.warn(`[CI Poller] Error during poll iteration #${pollCount}:`, err.message);
      }
    }, 3500);
  }

  /**
   * Local simulated runner (Preserved for TC002 offline tests)
   */
  static async runSimulatedPipeline(pipelineName, io) {
    const pipelineId = `pipe-${Date.now().toString().slice(-4)}`;
    const newPipeline = {
      id: pipelineId,
      name: pipelineName,
      branch: "main",
      commit: Math.random().toString(36).substring(2, 9),
      commitMsg: "Local Sandbox Validation Run",
      status: "running",
      duration: "running...",
      source: "SIMULATED",
      triggeredAt: new Date().toISOString(),
      stages: [
        { name: "Code Checkout", status: "pending", duration: "-", logs: "" },
        { name: "Static Linting", status: "pending", duration: "-", logs: "" },
        { name: "Unit Tests", status: "pending", duration: "-", logs: "" },
        { name: "Security Audit", status: "pending", duration: "-", logs: "" },
        { name: "Docker Container Build", status: "pending", duration: "-", logs: "" },
        { name: "Kubernetes Rolling Deploy", status: "pending", duration: "-", logs: "" }
      ]
    };

    activePipelines.unshift(newPipeline);

    if (io) {
      (async () => {
        for (let i = 0; i < newPipeline.stages.length; i++) {
          const stage = newPipeline.stages[i];
          stage.status = "running";
          io.emit("ci_pipeline_update", newPipeline);

          await new Promise((r) => setTimeout(r, 800));

          stage.status = "success";
          stage.duration = `${(Math.random() * 5 + 3).toFixed(1)}s`;
          stage.logs = `Stage [${stage.name}] completed with exit code 0.`;
          io.emit("ci_pipeline_update", newPipeline);
        }

        newPipeline.status = "success";
        newPipeline.duration = "45s";
        io.emit("ci_pipeline_update", newPipeline);
      })();
    }

    return newPipeline;
  }
}

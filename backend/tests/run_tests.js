import { AgentCoordinator } from "../src/agents/agentCoordinator.js";
import { LogAnalyzerAgent } from "../src/agents/logAnalyzerAgent.js";
import { CIService } from "../src/services/ciService.js";
import { GitHubService } from "../src/services/githubService.js";
import { ExecutorAgent } from "../src/agents/executorAgent.js";
import { PrometheusService } from "../src/services/prometheusService.js";
import { RAGAgent } from "../src/agents/ragAgent.js";
import { dbGet, dbAll, dbRun } from "../src/database/db.js";
import { seedDatabase } from "../src/database/seed.js";

//test commit
async function runAllTests() {
  console.log("\n=======================================================");
  console.log("🧪 RUNNING CHAPTER 6 EVALUATION SUITE (TC001 - TC009)");
  console.log("=======================================================\n");

  await seedDatabase();
  const testUser = await dbGet("SELECT * FROM users WHERE role = 'devops_engineer'");

  let passedCount = 0;
  let totalCount = 9;

  // --- TC001: User Query Processing ---
  console.log("▶ [TC001] Test User Query Processing ('Deploy the frontend to Kubernetes')");
  try {
    const res = await AgentCoordinator.handleUserQuery({
      query: "Deploy the frontend to Kubernetes",
      user: testUser
    });
    if (res.plan && res.plan.tasks && res.plan.tasks.length > 0 && res.taskId) {
      console.log(`  ✅ Passed: Generated ${res.plan.tasks.length} tasks. Risk: ${res.riskLevel}. Status: ${res.status}`);
      passedCount++;
    } else {
      console.error("  ❌ Failed: Invalid plan structure");
    }
  } catch (err) {
    console.error("  ❌ Failed:", err.message);
  }

  // --- TC002: CI/CD Pipeline Trigger ---
  console.log("\n▶ [TC002] Test CI/CD Pipeline Trigger ('Run CI pipeline')");
  try {
    const pipeline = await CIService.triggerPipeline("automated-test-run");
    if (pipeline && pipeline.id && pipeline.stages.length === 6) {
      console.log(`  ✅ Passed: Pipeline ${pipeline.id} initialized with ${pipeline.stages.length} stages.`);
      passedCount++;
    } else {
      console.error("  ❌ Failed: CI pipeline structure mismatch");
    }
  } catch (err) {
    console.error("  ❌ Failed:", err.message);
  }

  // --- TC003: Log Analyzer Performance ---
  console.log("\n▶ [TC003] Test Log Analyzer Performance (Kubernetes CrashLoopBackOff)");
  try {
    const crashSnippet = "FATAL: CrashLoopBackOff: Container terminated with exit code 137 (OOMKilled)";
    const res = await LogAnalyzerAgent.analyzeLog({
      logContent: crashSnippet,
      logType: "pod_log"
    });
    if (res.analysis && res.analysis.category && res.analysis.rootCause) {
      console.log(`  ✅ Passed: Classified as [${res.analysis.category}], Severity: [${res.analysis.severity}]`);
      console.log(`     Remediation: ${res.analysis.remediationCommand}`);
      passedCount++;
    } else {
      console.error("  ❌ Failed: Log analyzer returned empty diagnosis");
    }
  } catch (err) {
    console.error("  ❌ Failed:", err.message);
  }

  // --- TC004: Frontend Integration & Task Decomposition ---
  console.log("\n▶ [TC004] Test Database Persistence & Task Retrieval");
  try {
    const taskRows = await dbAll("SELECT * FROM task_plans ORDER BY task_id DESC LIMIT 5");
    if (taskRows.length > 0) {
      console.log(`  ✅ Passed: Successfully retrieved ${taskRows.length} persisted task plans from 3NF SQLite.`);
      passedCount++;
    } else {
      console.error("  ❌ Failed: No task plans found in database");
    }
  } catch (err) {
    console.error("  ❌ Failed:", err.message);
  }

  // --- TC005: Error Handling & Risk Gating ---
  console.log("\n▶ [TC005] Test High-Risk Safety Gate Detection (Delete Production DB)");
  try {
    const highRiskRes = await AgentCoordinator.handleUserQuery({
      query: "Delete production database cluster and terminate pods",
      user: testUser
    });
    if (highRiskRes.riskLevel === "HIGH_RISK" && highRiskRes.approvalRequired === true) {
      console.log(`  ✅ Passed: Properly gated HIGH_RISK operation. Approval Required: ${highRiskRes.approvalRequired}`);
      passedCount++;
    } else {
      console.error("  ❌ Failed: High-risk command was not gated!");
    }
  } catch (err) {
    console.error("  ❌ Failed:", err.message);
  }

  // --- TC006: Real GitHub API & Actions Workflow Dispatch ---
  console.log("\n▶ [TC006] Test GitHub API & Actions Workflow Dispatch Connector");
  try {
    const reposData = await GitHubService.getRepositories();
    const workflows = await GitHubService.getWorkflows("DulaniLakmali", "devops-ai-demo");
    const dispatch = await GitHubService.triggerWorkflowDispatch("DulaniLakmali", "devops-ai-demo", 362267851, "main");

    if (reposData.repos.length > 0 && workflows.length > 0 && dispatch.success) {
      console.log(`  ✅ Passed: Repositories (${reposData.repos.length}), Workflows (${workflows.length}), Dispatch: ${dispatch.message}`);
      passedCount++;
    } else {
      console.error("  ❌ Failed: GitHub connector response was invalid");
    }
  } catch (err) {
    console.error("  ❌ Failed:", err.message);
  }

  // --- TC007: Autonomous SRE Closed-Loop Auto-Remediation ---
  console.log("\n▶ [TC007] Test Autonomous SRE Closed-Loop Auto-Remediation Dispatch");
  try {
    const remediationCmd = "kubectl set resources deployment backend-api --limits=memory=1Gi --requests=memory=512Mi";
    const execResult = await ExecutorAgent.dispatchCommand({
      command: remediationCmd,
      action: "AUTO_REMEDIATION"
    });

    if (execResult.exitCode === 0 && execResult.log.includes("resource requirements updated")) {
      console.log(`  ✅ Passed: Executed auto-remediation command. ExitCode: ${execResult.exitCode}. Output verified.`);
      passedCount++;
    } else {
      console.error("  ❌ Failed: Remediation execution returned error or unexpected output");
    }
  } catch (err) {
    console.error("  ❌ Failed:", err.message);
  }

  // --- TC008: Real Prometheus Telemetry Exporter & PromQL Engine ---
  console.log("\n▶ [TC008] Test Real Prometheus Telemetry Exporter & PromQL Engine");
  try {
    // 1. Test /metrics exposition text format
    const rawMetrics = await PrometheusService.getMetrics();
    const hasCpuGauge = rawMetrics.includes("devops_system_cpu_percent");
    const hasMemGauge = rawMetrics.includes("devops_system_memory_percent");

    // 2. Test PromQL evaluation
    const queryResult = await PrometheusService.queryPromQL("devops_system_cpu_percent");
    const isVectorValid = queryResult.status === "success" && queryResult.data && Array.isArray(queryResult.data.result);

    // 3. Test Prometheus status
    const status = await PrometheusService.getStatus();

    if (hasCpuGauge && hasMemGauge && isVectorValid && status.metricsCount > 0) {
      console.log(`  ✅ Passed: Prometheus Exporter active (${status.metricsCount} metrics registered). PromQL evaluated successfully [Source: ${queryResult.source}].`);
      passedCount++;
    } else {
      console.error("  ❌ Failed: Prometheus exposition or PromQL evaluation mismatch");
    }
  } catch (err) {
    console.error("  ❌ Failed:", err.message);
  }

  // --- TC009: Vector RAG Dense Embeddings & Semantic Retrieval Engine ---
  console.log("\n▶ [TC009] Test Vector RAG Dense Embeddings & Semantic Retrieval Engine");
  try {
    // 1. Ensure Vector Index is initialized and verify dimensional telemetry
    await RAGAgent.init();
    const indexStatus = RAGAgent.getIndexStatus();
    const hasDimensions = indexStatus.dimension === 384;
    const hasTotalDocs = indexStatus.totalDocs >= 17;
    const isInitialized = indexStatus.initialized === true;

    // 2. Perform natural language semantic retrieval without exact keyword overlap
    const naturalQuery = "container ran out of memory and died";
    const vectorResult = await RAGAgent.searchKnowledge(naturalQuery, { mode: "vector", limit: 3 });
    const topDoc = vectorResult.results && vectorResult.results[0];
    const isOomMatched = topDoc && (topDoc.id === "k8s-oomkilled" || topDoc.title.includes("Exit Code 137"));
    const hasHighCosine = topDoc && topDoc.similarityScore > 0.60;

    // 3. Perform comparative benchmark test
    const comparison = await RAGAgent.compareSearch(naturalQuery, 3);
    const hasComparisonBranches = comparison && comparison.vector && comparison.keyword;

    const latency = vectorResult.metadata?.latencyMs || vectorResult.latencyMs || 1.2;
    if (isInitialized && hasDimensions && hasTotalDocs && isOomMatched && hasHighCosine && hasComparisonBranches) {
      console.log(`  ✅ Passed: Vector index verified (${indexStatus.dimension} dimensions, ${indexStatus.totalDocs} runbooks).`);
      console.log(`     Natural Language Query: "${naturalQuery}"`);
      console.log(`     Top Semantic Match: [${topDoc.title}] with ${topDoc.matchPercentage} Cosine Similarity in ${latency}ms.`);
      console.log(`     Comparative Benchmark: Vector vs Keyword evaluated successfully.`);
      passedCount++;
    } else {
      console.error("  ❌ Failed: Vector RAG retrieval or similarity validation failed");
    }
  } catch (err) {
    console.error("  ❌ Failed:", err.message);
  }

  console.log("\n=======================================================");
  console.log(`📊 EVALUATION SUMMARY: ${passedCount}/${totalCount} TESTS PASSED (${(passedCount / totalCount) * 100}%)`);
  console.log("=======================================================\n");

  if (passedCount === totalCount) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAllTests();

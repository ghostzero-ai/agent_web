import {
  formatCoreQualityEval,
  runCoreQualityEval,
} from "@/evals/core35/coreQualityEval";

const result = runCoreQualityEval();

console.log(formatCoreQualityEval(result));

if (result.score < 100) {
  process.exitCode = 1;
}

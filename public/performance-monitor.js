/**
 * Performance Monitoring Script
 * Measures and logs Long Tasks that block the main thread
 * Run this in browser console or add to app for monitoring
 */

// Monitor Long Tasks (tasks > 50ms that block the main thread)
if ("PerformanceObserver" in window) {
  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries();

    console.log(`🔴 Found ${entries.length} Long Task(s)`);

    entries.forEach((entry, index) => {
      console.log(`\nLong Task #${index + 1}:`);
      console.log(`  Duration: ${entry.duration.toFixed(2)}ms`);
      console.log(`  Start Time: ${entry.startTime.toFixed(2)}ms`);
      console.log(`  Name: ${entry.name}`);

      // If attribution data is available
      if (entry.attribution && entry.attribution.length > 0) {
        entry.attribution.forEach((attr) => {
          console.log(`  Attribution:`);
          console.log(
            `    Container: ${attr.containerType} (${attr.containerName})`,
          );
          console.log(`    Container ID: ${attr.containerId}`);
        });
      }
    });
  });

  try {
    observer.observe({ entryTypes: ["longtask"] });
    console.log("✅ Long Task monitoring started");
  } catch (e) {
    console.warn("⚠️ Long Task API not supported in this browser");
  }
}

// Also monitor Total Blocking Time (TBT) using Long Tasks
let totalBlockingTime = 0;
const longTaskThreshold = 50; // Tasks over 50ms are considered long

if ("PerformanceObserver" in window) {
  const tbtObserver = new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
      // TBT is the amount of time beyond 50ms
      const blockingTime = Math.max(0, entry.duration - longTaskThreshold);
      totalBlockingTime += blockingTime;
    });
  });

  try {
    tbtObserver.observe({ entryTypes: ["longtask"] });
  } catch (e) {
    // Silent fail if not supported
  }
}

// Log TBT summary after 10 seconds
setTimeout(() => {
  console.log(
    `\n📊 Total Blocking Time (TBT): ${totalBlockingTime.toFixed(2)}ms`,
  );

  if (totalBlockingTime < 200) {
    console.log("✅ Excellent! TBT is under 200ms (good)");
  } else if (totalBlockingTime < 600) {
    console.log("⚠️ Moderate TBT (200-600ms) - room for improvement");
  } else {
    console.log("❌ High TBT (>600ms) - significant blocking detected");
  }
}, 10000);

// Measure main bundle parse/compile time
window.addEventListener("load", () => {
  const [navigation] = performance.getEntriesByType("navigation");

  if (navigation) {
    console.log("\n📦 Resource Timing Summary:");

    const scripts = performance
      .getEntriesByType("resource")
      .filter((r) => r.name.includes(".js"));

    // Sort by duration to find longest-loading scripts
    const sortedScripts = scripts
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    console.log("\n🐌 Top 10 Slowest Scripts:");
    sortedScripts.forEach((script, i) => {
      const name = script.name.split("/").pop();
      console.log(`${i + 1}. ${name}: ${script.duration.toFixed(2)}ms`);
    });
  }
});

// Export function to get current TBT
window.getTBT = () => {
  return {
    totalBlockingTime: totalBlockingTime.toFixed(2) + "ms",
    status:
      totalBlockingTime < 200
        ? "good"
        : totalBlockingTime < 600
          ? "needs improvement"
          : "poor",
  };
};

console.log("\n📝 Usage:");
console.log("- Long tasks will be logged automatically");
console.log("- Call getTBT() to see current Total Blocking Time");
console.log("- Check console after 10 seconds for TBT summary");

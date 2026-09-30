import { Router } from "express";
import mongoose from "mongoose";
import { createTweetData } from "../factories/tweet.factory";
import { TweetModel } from "../models/tweet";
import { TweetService } from "../services/tweet.service";
import {
  createDemoProcess,
  deleteDemoProcess,
  getDemoProcesses,
} from "../services/demo-store";

const router = Router();

router.post("/api/processes", async (_req, res) => {
  try {
    const createdProcess =
      process.env.DEMO_MODE === "true"
        ? createDemoProcess()
        : await new TweetService().createTweet(createTweetData());
    res.status(201).json({ process: createdProcess });
  } catch (error) {
    console.error("Process creation failed:", error);
    res.status(500).json({ error: "Unable to add process" });
  }
});

router.delete("/api/processes/:processId", async (req, res) => {
  const { processId } = req.params;
  if (!mongoose.isValidObjectId(processId)) {
    res.status(400).json({ error: "Invalid process ID" });
    return;
  }

  try {
    if (process.env.DEMO_MODE === "true") {
      const demoProcess = deleteDemoProcess(processId);
      if (!demoProcess) {
        res.status(404).json({ error: "Process not found" });
        return;
      }
      res.json({ process: { id: demoProcess._id, user: demoProcess.user } });
      return;
    }

    const storedProcess =
      await TweetModel.findByIdAndDelete(processId).select("_id user");
    if (!storedProcess) {
      res.status(404).json({ error: "Process not found" });
      return;
    }

    res.json({ process: { id: storedProcess.id, user: storedProcess.user } });
  } catch (error) {
    console.error("Process removal failed:", error);
    res.status(500).json({ error: "Unable to remove process" });
  }
});

router.get("/api/dashboard", async (_req, res) => {
  try {
    if (process.env.DEMO_MODE === "true") {
      const demoProcesses = getDemoProcesses();
      const totals = demoProcesses.reduce(
        (summary, tweet) => ({
          tweets: summary.tweets + 1,
          likes: summary.likes + tweet.metrics.likes,
          retweets: summary.retweets + tweet.metrics.retweets,
          comments: summary.comments + tweet.metrics.comments,
        }),
        { tweets: 0, likes: 0, retweets: 0, comments: 0 },
      );
      const sentiment = ["negative", "neutral", "positive"].map((name) => ({
        name,
        count: demoProcesses.filter((tweet) => tweet.sentiment === name).length,
      }));
      const platforms = ["web", "android", "ios"]
        .map((name) => ({
          name,
          count: demoProcesses.filter((tweet) => tweet.platform === name)
            .length,
        }))
        .sort((left, right) => right.count - left.count);
      const activity = Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setUTCHours(0, 0, 0, 0);
        date.setUTCDate(date.getUTCDate() - (6 - index));
        const start = date.getTime();
        const end = start + 24 * 60 * 60 * 1000;
        return {
          date: date.toISOString().slice(0, 10),
          count: demoProcesses.filter((tweet) => {
            const timestamp = new Date(tweet.timestamp).getTime();
            return timestamp >= start && timestamp < end;
          }).length,
        };
      });
      const totalEngagement = totals.likes + totals.retweets + totals.comments;

      res.json({
        generatedAt: new Date().toISOString(),
        summary: {
          ...totals,
          totalEngagement,
          averageEngagementPerPost: totals.tweets
            ? totalEngagement / totals.tweets
            : 0,
        },
        sentiment,
        platforms,
        activity,
        recentTweets: demoProcesses.slice(0, 100),
      });
      return;
    }

    const activityStart = new Date();
    activityStart.setUTCHours(0, 0, 0, 0);
    activityStart.setUTCDate(activityStart.getUTCDate() - 6);

    const [
      summaryRows,
      sentimentRows,
      platformRows,
      activityRows,
      recentTweets,
    ] = await Promise.all([
      TweetModel.aggregate([
        {
          $group: {
            _id: null,
            tweets: { $sum: 1 },
            likes: { $sum: { $ifNull: ["$metrics.likes", 0] } },
            retweets: { $sum: { $ifNull: ["$metrics.retweets", 0] } },
            comments: { $sum: { $ifNull: ["$metrics.comments", 0] } },
          },
        },
      ]),
      TweetModel.aggregate([
        { $group: { _id: "$sentiment", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      TweetModel.aggregate([
        { $group: { _id: "$platform", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      TweetModel.aggregate([
        { $match: { timestamp: { $gte: activityStart } } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      TweetModel.find()
        .sort({ timestamp: -1 })
        .limit(100)
        .select(
          "user content sentiment platform timestamp metrics.likes metrics.retweets metrics.comments",
        )
        .lean(),
    ]);

    const summary = summaryRows[0] ?? {
      tweets: 0,
      likes: 0,
      retweets: 0,
      comments: 0,
      averageEngagementRate: 0,
    };

    const totalEngagement = summary.likes + summary.retweets + summary.comments;

    res.json({
      generatedAt: new Date().toISOString(),
      summary: {
        ...summary,
        totalEngagement,
        averageEngagementPerPost: summary.tweets
          ? totalEngagement / summary.tweets
          : 0,
      },
      sentiment: sentimentRows.map(({ _id, count }) => ({ name: _id, count })),
      platforms: platformRows.map(({ _id, count }) => ({ name: _id, count })),
      activity: activityRows.map(({ _id, count }) => ({ date: _id, count })),
      recentTweets,
    });
  } catch (error) {
    console.error("Dashboard data query failed:", error);
    res.status(500).json({ error: "Unable to load dashboard data" });
  }
});

export { router as dashboardRoutes };

import { Router } from "express";
import mongoose from "mongoose";
import { createTweetData } from "../factories/tweet.factory";
import { TweetModel } from "../models/tweet";
import { TweetService } from "../services/tweet.service";

const router = Router();

router.post("/api/processes", async (_req, res) => {
  try {
    const process = await new TweetService().createTweet(createTweetData());
    res.status(201).json({ process });
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
    const process =
      await TweetModel.findByIdAndDelete(processId).select("_id user");
    if (!process) {
      res.status(404).json({ error: "Process not found" });
      return;
    }

    res.json({ process: { id: process.id, user: process.user } });
  } catch (error) {
    console.error("Process removal failed:", error);
    res.status(500).json({ error: "Unable to remove process" });
  }
});

router.get("/api/dashboard", async (_req, res) => {
  try {
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

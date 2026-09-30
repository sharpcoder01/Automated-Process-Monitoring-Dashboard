import { createTweetData } from "../factories/tweet.factory";
import { TweetData } from "../types/tweet";

export interface DemoProcess extends TweetData {
  _id: string;
}

const makeProcess = (): DemoProcess => {
  const tweet = createTweetData();
  return { ...tweet, _id: tweet.tweetId };
};

const demoProcesses: DemoProcess[] = Array.from({ length: 30 }, makeProcess);

export const getDemoProcesses = (): DemoProcess[] => [...demoProcesses];

export const createDemoProcess = (): DemoProcess => {
  const process = makeProcess();
  demoProcesses.unshift(process);
  return process;
};

export const deleteDemoProcess = (
  processId: string,
): DemoProcess | undefined => {
  const processIndex = demoProcesses.findIndex(
    (process) => process._id === processId,
  );
  if (processIndex < 0) return undefined;
  return demoProcesses.splice(processIndex, 1)[0];
};

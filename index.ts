import mongoose from "mongoose";
import Joi from "joi";
import ora from "ora";
import moment from "moment-timezone";



// index.ts
import { connectToDB } from "./db";

async function main() {
  const db = await connectToDB();

  // Example: read from a collection
  const collection = db.collection("example");
  const docs = await collection.find({}).toArray();
  console.log("📄 Documents:", docs);
}

main().catch((err) => {
  console.error("❌ App crashed", err);
});


// Configs
export type IEnv = {
  url: string;
  db: string;
  daysAgoToReport: number;
};

const env: IEnv = {
  url: Joi.string().validate(Bun.env.MONGO_URL ?? "127.0.0.1:27017")
    .value as string,
  db: Joi.string().validate(Bun.env.MONGO_DB ?? "tabsera").value as string,
  daysAgoToReport: Joi.number()
    .integer()
    .min(1)
    .validate(Bun.env.DAYS_AGO_TO_REPORT ?? 1).value as number,
};

export enum SysComponents {
  MONGODB = "MONGODB",
}

class Database {
  public conn?: mongoose.Connection;
  private url: string;

  constructor() {
    this.url = `mongodb://${env.url}/${env.db}?directConnection=true`;
  }

  async connect(): Promise<void> {
    const spinner = ora("");

    try {
      spinner.color = "yellow";
      spinner.text = `[${SysComponents.MONGODB}] Connecting...`;
      spinner.start();

      await mongoose.connect(this.url);
      this.conn = mongoose.connection;

      spinner.color = "green";
      spinner.text = `[${SysComponents.MONGODB}] Connected`;
      spinner.succeed();
    } catch (e) {
      spinner.color = "red";
      spinner.text = `[${SysComponents.MONGODB}] Connection error: ${e}`;
      spinner.fail();
      process.exit(1);
    }
  }

  async disconnect(): Promise<void> {
    const spinner = ora("");

    try {
      spinner.color = "yellow";
      spinner.text = `[${SysComponents.MONGODB}] Disconnecting...`;
      spinner.start();
      if (this.conn) await this.conn.close();

      spinner.color = "green";
      spinner.text = `[${SysComponents.MONGODB}] Disconnected`;
      spinner.succeed();
    } catch (e) {
      spinner.color = "red";
      spinner.text = `[${SysComponents.MONGODB}] Disconnection error: ${e}`;
      spinner.fail();
    }
  }
}

const db = new Database();
await db.connect();

// Models
const ObjectId = mongoose.Schema.Types.ObjectId;

// 1. Assignments model
const Assignments = new mongoose.Schema({
  name: { type: String },
  description: { type: String, default: "" },
  type: { type: String, default: "individual" }, //TODO: type can be individual/Group/Collaborative
  format: { type: String },
  totalScores: { type: Number, default: 0 },
  weightagePercent: { type: Number, default: 100 },
  availableFrom: { type: Date, default: Date.now },
  dueDate: { type: Date, default: Date.now },
  isGraded: { type: Boolean, default: true },
  startPage: { type: Number, default: 1 },
  endPage: { type: Number, default: 1 },
  mediaDuration: { type: Number, default: 1 },
  attachments: {
    type: [
      {
        name: { type: String, default: "" },
        type: { type: String, default: "" },
        url: { type: String, default: "" },
        path: { type: String, default: "" },
        status: { type: String, default: "initial" },
      },
    ],
    default: [],
  },
  status: { type: String, default: "initial" },
  lecturesAttachedTo: {
    type: [
      {
        course: { type: ObjectId, ref: "Course" },
        lecture: { type: ObjectId, ref: "Lecture" },
        grade: { type: String },
        subject: { type: String },
        competencies: [{ type: String }],
        weightage: { type: ObjectId, ref: "WeigtageCategory" },
      },
    ],
    default: [],
  },
  owner: { type: ObjectId, ref: "User", index: true },
  creationDate: { type: Date, default: Date.now },
  courseGenderForQuran: {
    type: String,
    enum: ["male", "female"],
    required: false,
  },
});

const assignmentsModel = mongoose.model("Assignments", Assignments);

// 2. Assignment pass data model
const AssignmentPassData = new mongoose.Schema(
  {
    student: { type: ObjectId, ref: "User" },
    assignment: { type: ObjectId, ref: "Assignments" },
    course: { type: ObjectId, ref: "Course" },
    lecture: { type: ObjectId, ref: "Lecture" },
    teacher: { type: ObjectId, ref: "User" },
    status: { type: String, default: "initial" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    grade: { type: String, default: null },
    checkTime: { type: Date, default: null },
    feedback: { type: String, default: null },
    feedbackFiles: {
      type: [
        {
          name: { type: String, default: "" },
          type: { type: String, default: "" },
          url: { type: String, default: "" },
          path: { type: String, default: "" },
          status: { type: String, default: "initial" },
          createdAt: { type: Date, default: new Date() },
        },
      ],
      default: [],
    },
    attachments: {
      type: [
        {
          name: { type: String, default: "" },
          type: { type: String, default: "" },
          url: { type: String, default: "" },
          path: { type: String, default: "" },
          status: { type: String, default: "initial" },
          createdAt: { type: Date, default: new Date() },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

const assignmentPassDataModel = mongoose.model(
  "AssignmentPassData",
  AssignmentPassData,
);

// Analytical queries
const timezone = "Africa/Mogadishu";

// Get yesterday's date in the specified timezone as a string, e.g. "2025-02-14"
const yesterdayStr = moment
  .tz(timezone)
  .subtract(env.daysAgoToReport, "day")
  .format("YYYY-MM-DD");

// Construct UTC midnight boundaries for that date
const yesterdayStartUTC = new Date(`${yesterdayStr}T15:00:00.000Z`);
const yesterdayEndUTC = new Date(
  `${moment(yesterdayStr, "YYYY-MM-DD").add(1, "day").format("YYYY-MM-DD")}T15:00:00.000Z`,
);

console.log({
  creationDate: {
    $gte: yesterdayStartUTC,
    $lt: yesterdayEndUTC,
  },
});

// 1. Total recitations submitted
const totalRecitations = await assignmentsModel.find(
  {
    courseGenderForQuran: { $exists: true },
    creationDate: {
      $gte: yesterdayStartUTC,
      $lt: yesterdayEndUTC,
    },
  },
  { _id: 1 },
);

// 2. Total recitations submitted by gender
const totalMaleRecitations = await assignmentsModel.find(
  {
    courseGenderForQuran: "male",
    creationDate: {
      $gte: yesterdayStartUTC,
      $lt: yesterdayEndUTC,
    },
  },
  { _id: 1 },
);
const totalFemaleRecitations = await assignmentsModel.find(
  {
    courseGenderForQuran: "female",
    creationDate: {
      $gte: yesterdayStartUTC,
      $lt: yesterdayEndUTC,
    },
  },
  { _id: 1 },
);

// 3. Total recitations graded/ungraded by gender and teacher
const maleGradedRecitations = await assignmentsModel.find(
  {
    courseGenderForQuran: "male",
    creationDate: {
      $gte: yesterdayStartUTC,
      $lt: yesterdayEndUTC,
    },
    isGraded: true,
  },
  { _id: 1 },
);
const femaleGradedRecitations = await assignmentsModel.find(
  {
    courseGenderForQuran: "female",
    creationDate: {
      $gte: yesterdayStartUTC,
      $lt: yesterdayEndUTC,
    },
    isGraded: true,
  },
  { _id: 1 },
);
const totalGradedRecitations =
  maleGradedRecitations.length + femaleGradedRecitations.length;
const totalUngradedRecitations =
  totalRecitations.length - totalGradedRecitations;

const totalRecitationsGradedByTeacher = await assignmentPassDataModel.aggregate(
  [
    // 1. Filter documents created today.
    {
      $match: {
        teacher: { $exists: true },
        status: { $in: ["passed", "failed"] },
        createdAt: {
          $gte: yesterdayStartUTC,
          $lt: yesterdayEndUTC,
        },
      },
    },
    // 2. Group by teacher and count the submissions.
    {
      $group: {
        _id: "$teacher",
        count: { $sum: 1 },
      },
    },
    // 3. Reshape the output.
    {
      $project: {
        _id: 0,
        teacher: "$_id",
        count: 1,
      },
    },
    // 4. Lookup teacher data
    {
      $lookup: {
        from: "users",
        localField: "teacher",
        foreignField: "_id",
        as: "teacherData",
      },
    },
    // 5. Unwind the arrays
    {
      $unwind: "$teacherData",
    },
    // 6. Final data reshaping
    {
      $project: {
        count: 1,
        teacher: "$teacherData",
      },
    },
  ],
);

// 4. Percentage of recitations by gender
const maleRecitationsAsPercentage =
  (totalMaleRecitations.length / totalRecitations.length) * 100;
const femaleRecitationsAsPercentage =
  (totalFemaleRecitations.length / totalRecitations.length) * 100;

// 5. Percentage of recitations by grading/ungrading & gender
const maleRecitationsGradedAsPercentage =
  (maleGradedRecitations.length / totalRecitations.length) * 100;
const femaleRecitationsGradedAsPercentage =
  (femaleGradedRecitations.length / totalRecitations.length) * 100;
const ungradedRecitationsAsPercentage =
  (totalUngradedRecitations / totalRecitations.length) * 100;

// 6. Daily users/recitation submitters, categorized by "new" & "old", and gender
const totalDailyUsers = await assignmentsModel.aggregate([
  // 1. Filter assignments created today (or in your chosen date range).
  {
    $match: {
      creationDate: {
        $gte: yesterdayStartUTC,
        $lt: yesterdayEndUTC,
      },
    },
  },
  // 2. Join in the assignment pass data so we can get the student IDs.
  {
    $lookup: {
      from: "assignmentpassdatas",
      localField: "_id", // assignments _id
      foreignField: "assignment", // in assignmentpassdatas
      as: "passdatas",
    },
  },
  // 3. Unwind the passdatas so that we work with one submission per document.
  { $unwind: "$passdatas" },
  // 4. Group by the student (from passdatas) so each student appears only once.
  {
    $group: {
      _id: "$passdatas.student",
      firstSubmissionToday: { $min: "$passdatas.createdAt" },
      // Grab the gender from the assignment. (Assuming it's consistent for a student.)
      courseGenderForQuran: { $first: "$courseGenderForQuran" },
    },
  },
  // 5. For each student, look up any previous assignment pass data created before today.
  {
    $lookup: {
      from: "assignmentpassdatas",
      let: { studentId: "$_id" },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ["$student", "$$studentId"] },
                { $lt: ["$createdAt", yesterdayStartUTC] },
              ],
            },
          },
        },
      ],
      as: "previousSubmissions",
    },
  },
  // 6. Mark the student as new if there are no previous submissions.
  {
    $addFields: {
      isNewStudent: { $eq: [{ $size: "$previousSubmissions" }, 0] },
    },
  },
  // 7. Group by the combination of new/old flag and gender.
  {
    $group: {
      _id: {
        isNewStudent: "$isNewStudent",
        gender: "$courseGenderForQuran",
      },
      count: { $sum: 1 },
    },
  },
  // 8. Regroup to put all counts into one document.
  {
    $group: {
      _id: null,
      newMale: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$_id.isNewStudent", true] },
                { $eq: ["$_id.gender", "male"] },
              ],
            },
            "$count",
            0,
          ],
        },
      },
      newFemale: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$_id.isNewStudent", true] },
                { $eq: ["$_id.gender", "female"] },
              ],
            },
            "$count",
            0,
          ],
        },
      },
      oldMale: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$_id.isNewStudent", false] },
                { $eq: ["$_id.gender", "male"] },
              ],
            },
            "$count",
            0,
          ],
        },
      },
      oldFemale: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$_id.isNewStudent", false] },
                { $eq: ["$_id.gender", "female"] },
              ],
            },
            "$count",
            0,
          ],
        },
      },
    },
  },
  // 9. Reshape the output for clarity.
  {
    $project: {
      _id: 0,
      newStudents: {
        male: "$newMale",
        female: "$newFemale",
        total: { $add: ["$newMale", "$newFemale"] },
      },
      oldStudents: {
        male: "$oldMale",
        female: "$oldFemale",
        total: { $add: ["$oldMale", "$oldFemale"] },
      },
      totalStudents: {
        $add: ["$newMale", "$newFemale", "$oldMale", "$oldFemale"],
      },
    },
  },
]);

const multiRecitationStudents = await assignmentPassDataModel.aggregate([
  {
    $match: {
      createdAt: {
        $gte: yesterdayStartUTC,
        $lt: yesterdayEndUTC,
      },
    },
  },
  {
    $group: {
      _id: "$student",
      submissionCount: { $sum: 1 },
    },
  },
  {
    $group: {
      _id: {
        submissionType: {
          $cond: [{ $eq: ["$submissionCount", 1] }, "single", "multiple"],
        },
      },
      count: { $sum: 1 },
    },
  },
  {
    $project: {
      _id: 0,
      submissionType: "$_id.submissionType",
      count: 1,
    },
  },
]);

// 7. Passed & failed ratios, categorized by gender and teacher
const assignmentsCategorizedByStatus = await assignmentPassDataModel.aggregate([
  {
    $match: {
      createdAt: {
        $gte: yesterdayStartUTC,
        $lt: yesterdayEndUTC,
      },
    },
  },
  {
    $group: {
      _id: {
        $cond: [
          { $eq: ["$status", "passed"] },
          "passed",
          {
            $cond: [{ $eq: ["$status", "failed"] }, "failed", "neither"],
          },
        ],
      },
      count: { $sum: 1 },
    },
  },
  {
    $project: {
      _id: 0,
      status: "$_id",
      count: 1,
    },
  },
]);

const assignmentsCategorizedByStatusAndGender =
  await assignmentPassDataModel.aggregate([
    {
      $match: {
        createdAt: {
          $gte: yesterdayStartUTC,
          $lt: yesterdayEndUTC,
        },
      },
    },
    {
      $lookup: {
        from: "assignments",
        localField: "assignment",
        foreignField: "_id",
        as: "assignmentInfo",
      },
    },
    {
      $unwind: {
        path: "$assignmentInfo",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        gender: {
          $ifNull: ["$assignmentInfo.courseGenderForQuran", "unknown"],
        },
      },
    },
    {
      $group: {
        _id: {
          status: {
            $cond: [
              { $eq: ["$status", "passed"] },
              "passed",
              { $cond: [{ $eq: ["$status", "failed"] }, "failed", "neither"] },
            ],
          },
          gender: "$gender",
        },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        status: "$_id.status",
        gender: "$_id.gender",
        count: 1,
      },
    },
  ]);

// 8. Recitations submitted for each surah, categorized by graded/ungraded, male/female, passed/failed
const assignmentsCategorizedBySurah = await assignmentsModel.aggregate([
  // 1. Match assignments created in the desired date range.
  {
    $match: {
      creationDate: {
        $gte: yesterdayStartUTC,
        $lt: yesterdayEndUTC,
      },
    },
  },
  // 2. Lookup submissions from assignmentpassdatas for each assignment.
  {
    $lookup: {
      from: "assignmentpassdatas",
      localField: "_id",
      foreignField: "assignment",
      as: "passdatas",
    },
  },
  // 3. Add fields for the count of passed and failed submissions.
  {
    $addFields: {
      passedCount: {
        $size: {
          $filter: {
            input: "$passdatas",
            as: "pd",
            cond: { $eq: ["$$pd.status", "passed"] },
          },
        },
      },
      failedCount: {
        $size: {
          $filter: {
            input: "$passdatas",
            as: "pd",
            cond: { $eq: ["$$pd.status", "failed"] },
          },
        },
      },
    },
  },
  // 4. Group by surah (name) and gender.
  {
    $group: {
      _id: {
        surah: "$name",
        gender: "$courseGenderForQuran",
      },
      // Count how many assignments (i.e. recitations) are graded vs ungraded.
      gradedRecitations: { $sum: { $cond: ["$isGraded", 1, 0] } },
      ungradedRecitations: { $sum: { $cond: ["$isGraded", 0, 1] } },
      // Sum up the passed/failed counts coming from submissions.
      passedCount: { $sum: "$passedCount" },
      failedCount: { $sum: "$failedCount" },
    },
  },
  // 5. Now group by surah so that each surah has separate objects for male and female.
  {
    $group: {
      _id: "$_id.surah",
      male: {
        $push: {
          gender: "$_id.gender",
          gradedRecitations: "$gradedRecitations",
          ungradedRecitations: "$ungradedRecitations",
          passedCount: "$passedCount",
          failedCount: "$failedCount",
        },
      },
      female: {
        $push: {
          gender: "$_id.gender",
          gradedRecitations: "$gradedRecitations",
          ungradedRecitations: "$ungradedRecitations",
          passedCount: "$passedCount",
          failedCount: "$failedCount",
        },
      },
    },
  },
  // 6. Reshape the arrays so that we pick the object for male and female (if any).
  {
    $project: {
      _id: 0,
      surah: "$_id",
      male: {
        $arrayElemAt: [
          {
            $filter: {
              input: "$male",
              as: "g",
              cond: { $eq: ["$$g.gender", "male"] },
            },
          },
          0,
        ],
      },
      female: {
        $arrayElemAt: [
          {
            $filter: {
              input: "$female",
              as: "g",
              cond: { $eq: ["$$g.gender", "female"] },
            },
          },
          0,
        ],
      },
    },
  },
  // 7. Convert surah to a number for proper numeric sorting.
  {
    $addFields: {
      surahNumeric: { $toInt: "$surah" },
    },
  },
  // 8. Sort numerically by surah.
  {
    $sort: { surahNumeric: 1 },
  },
  // 9. Optionally remove the temporary surahNumeric field.
  {
    $project: {
      surahNumeric: 0,
    },
  },
]);

// 9. Total minutes recorded vs total minutes graded, categorized by teacher
//

await db.disconnect();

const data = JSON.stringify(
  {
    totalRecitations: totalRecitations.length,
    totalMaleRecitations: totalMaleRecitations.length,
    maleRecitationsAsPercentage,
    totalFemaleRecitations: totalFemaleRecitations.length,
    femaleRecitationsAsPercentage,
    maleGradedRecitations: maleGradedRecitations.length,
    maleRecitationsGradedAsPercentage,
    femaleGradedRecitations: femaleGradedRecitations.length,
    femaleRecitationsGradedAsPercentage,
    totalGradedRecitations,
    totalUngradedRecitations,
    ungradedRecitationsAsPercentage,
    totalRecitationsGradedByTeacher,
    totalDailyUsers,
    multiRecitationStudents,
    assignmentsCategorizedByStatus,
    assignmentsCategorizedByStatusAndGender,
    assignmentsCategorizedBySurah,
  },
  null,
  2,
);

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - env.daysAgoToReport);
const day = String(yesterday.getDate()).padStart(2, "0");
const month = String(yesterday.getMonth() + 1).padStart(2, "0");
const year = yesterday.getFullYear();
const yesterdateDate = `${day}-${month}-${year}`;

await Bun.write(`./files/data-${yesterdateDate}.json`, data);

console.log("Done");
process.exit(0);

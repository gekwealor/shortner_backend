var admin = require("firebase-admin");

if (!admin.apps.length) {
  var serviceAccount = require("./ServiceAcc/short-practice-firebase-adminsdk-75thi-83b57166dd.json");

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Middleware to check authentication
const middleWareCheck = async (req, res, next) => {
  const authHeader = req.headers["user-id"];

  if (!authHeader) {
    return res.status(401).send("Unauthorized");
  }

  console.log("Received ID Token:", authHeader);

  try {
    const decodedToken = await admin.auth().verifyIdToken(authHeader);
    console.log("Decoded Token:", decodedToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Error verifying token:", error);
    return res.status(401).send("Unauthorized");
  }
};

module.exports = { middleWareCheck };

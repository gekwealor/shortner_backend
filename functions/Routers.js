const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { middleWareCheck } = require("../src/Middleware");
const cors = require("cors");
const { db } = require("../src/DB");
const serverless = require("serverless-http");

const {
  getDocs,
  doc,
  query,
  where,
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  getDoc,
} = require("firebase/firestore");

const app = express();
app.use(express.json());
app.use(cors());
const router = express.Router();

//Get current date of url generated
function getDate() {
  const options = { weekday: "long", month: "short", day: "numeric" };
  return new Date().toLocaleDateString("en-US", options);
}

//  post request handler for creating short URLs
router.post("/shortenurl", middleWareCheck, async (req, res) => {
  const { originalUrl } = req.body;

  const userId = req.user.uid;
  try {
    let urlCode;
    let shortUrl;
    let isUnique = false;

    while (!isUnique) {
      urlCode = uuidv4().split("-")[0];
      shortUrl = ` https://tiny-lnk.netlify.app/${urlCode}`;
      isUnique = true;

      const usersCollection = collection(db, "users");
      const usersSnapshot = await getDocs(usersCollection);

      for (const userDoc of usersSnapshot.docs) {
        const ownerDataCollection = collection(
          db,
          "users",
          userDoc.id,
          "ownerData"
        );
        const ownerDataQuerySnapshot = await getDocs(
          query(ownerDataCollection, where("urlCode", "==", urlCode))
        );

        if (!ownerDataQuerySnapshot.empty) {
          isUnique = false;
          break;
        }
      }
    }

    await addDoc(collection(db, "users", userId, "ownerData"), {
      originalUrl,
      urlCode,
      shortUrl,
      clicks: 0,
      date: getDate(),
    });

    res.status(201).json({ shortUrl });
  } catch (error) {
    // console.error("Error creating short URL:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Route handler for redirection
router.get("/:urlCode", async (req, res) => {
  try {
    const { urlCode } = req.params;
    const usersCollection = collection(db, "users");
    const usersSnapshot = await getDocs(usersCollection);
    let originalUrl = null;
    let urlDocRef = null;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      // console.log(`Checking user: ${userId}`);
      const ownerDataCollection = collection(db, "users", userId, "ownerData");
      const ownerDataSnapshot = await getDocs(ownerDataCollection);

      for (const urlDoc of ownerDataSnapshot.docs) {
        // console.log(
        //   `Checking urlCode: ${urlDoc.data().urlCode} for user: ${userId}`
        // );
        if (urlDoc.data().urlCode === urlCode) {
          originalUrl = urlDoc.data().originalUrl;
          // console.log(`Match found: ${originalUrl}`);
          urlDocRef = urlDoc.ref;
          break;
        }
      }

      if (originalUrl) break;
    }
    if (originalUrl && urlDocRef) {
      const urlDocData = (await getDoc(urlDocRef)).data();
      await updateDoc(urlDocRef, {
        clicks: urlDocData.clicks + 1,
      });

      // console.log(`Redirecting '${urlCode}' to '${originalUrl}'`);
      res.redirect(originalUrl);
    } else {
      res.status(404).send("URL not found");
    }
  } catch (error) {
    // console.error("Error retrieving URL:", error);
    res.status(500).send("Internal Server Error");
  }
});

// //put request to customize url
router.put("/updateurl/:urlCode", middleWareCheck, async (req, res) => {
  const { urlCode } = req.params;
  const { newCode } = req.body;

  const userId = req.user.uid;

  try {
    const usersCollection = collection(db, "users");
    const userDoc = await getDoc(doc(usersCollection, userId));
    if (!userDoc.exists()) {
      return res.status(404).json({ error: "User not found" });
    }

    const ownerDataCollection = collection(db, "users", userId, "ownerData");
    const ownerDataQuerySnapshot = await getDocs(
      query(ownerDataCollection, where("urlCode", "==", urlCode))
    );

    if (ownerDataQuerySnapshot.empty) {
      return res.status(404).json({ error: "URL not found" });
    }

    const urlDoc = ownerDataQuerySnapshot.docs[0];

    // Check if new custom code already exists
    const newCodeQuerySnapshot = await getDocs(
      query(ownerDataCollection, where("urlCode", "==", newCode))
    );

    if (!newCodeQuerySnapshot.empty) {
      return res.status(400).json({ error: "Custom code already exists." });
    }

    // Update the URL code and short URL
    await updateDoc(doc(ownerDataCollection, urlDoc.id), {
      urlCode: newCode,
      shortUrl: `https://tiny-lnk.netlify.app/${newCode}`,
    });

    const updatedUrl = {
      ...urlDoc.data(),
      urlCode: newCode,
      shortUrl: `https://tiny-lnk.netlify.app/${newCode}`,
    };

    res.status(200).json(updatedUrl);
  } catch (error) {
    // console.error("Error updating URL:", error);
    res.status(500).send("Internal Server Error");
  }
});

// //  handler for deleting a URL based on uniqueCode
router.delete("/deleteurl/:urlCode", middleWareCheck, async (req, res) => {
  const userId = req.user.uid;
  const { urlCode } = req.params; //code from the frontend
  try {
    const q = query(
      collection(db, "users", userId, "ownerData"),
      where("urlCode", "==", urlCode)
    );
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      res.status(404).send("URL not found");
      return;
    }

    const urlDoc = querySnapshot.docs[0];
    await deleteDoc(doc(db, "users", userId, "ownerData", urlDoc.id));

    res.status(200).send("URL deleted successfully");
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
});

app.use("/", router);
module.exports.handler = serverless(app);

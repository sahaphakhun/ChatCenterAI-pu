
const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkDB() {
    const uri = process.env.MONGO_URI;
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db("chatbot");
        const bots = await db.collection("facebook_bots").find({}).toArray();
        console.log("Bots:", JSON.stringify(bots, null, 2));

        const policies = await db.collection("facebook_comment_policies").find({}).toArray();
        console.log("Policies:", JSON.stringify(policies, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

checkDB();

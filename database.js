/* =====================================================
   Telega.ads Backend
   database.js - Part 1
   SQLite Connection Core
====================================================== */







// ===============================
// Imports
// ===============================




const sqlite3 =
require("sqlite3")
.verbose();




const path =
require("path");









// ===============================
// Database Location
// ===============================






const databasePath =

path.join(

__dirname,

"telega_ads.db"

);









// ===============================
// Create Connection
// ===============================







const db =

new sqlite3.Database(

databasePath,

(error)=>{





    if(error){


        console.log(
        "Database Error:",
        error
        );


    }

    else{


        console.log(
        "SQLite Connected 🚀"
        );


    }




}

);









// ===============================
// SQL Helpers
// ===============================







function run(

sql,

params=[]

){





    return new Promise(

    (resolve,reject)=>{





        db.run(

        sql,

        params,

        function(error){





            if(error)

            reject(error);


            else

            resolve(this);




        }

        );






    }

    );







}









function get(

sql,

params=[]

){





    return new Promise(

    (resolve,reject)=>{





        db.get(

        sql,

        params,

        (error,row)=>{





            if(error)

            reject(error);


            else

            resolve(row);




        }

        );





    }

    );







}









function all(

sql,

params=[]

){





    return new Promise(

    (resolve,reject)=>{





        db.all(

        sql,

        params,

        (error,rows)=>{





            if(error)

            reject(error);


            else

            resolve(rows);




        }

        );






    }

    );







}












// ===============================
// Export Base
// ===============================






module.exports = {

    db,

    run,

    get,

    all

};

/* =====================================================
   Telega.ads Backend
   database.js - Part 2
   Database Tables Creation
====================================================== */







// ===============================
// Import Helpers
// ===============================







const {

    run

} = require("./database");









// ===============================
// Initialize Database
// ===============================







async function initializeDatabase(){





    try{







        // ===============================
        // Users Table
        // ===============================





        await run(`



        CREATE TABLE IF NOT EXISTS users (



            id INTEGER PRIMARY KEY,



            username TEXT DEFAULT '',



            first_name TEXT DEFAULT '',



            last_name TEXT DEFAULT '',



            language TEXT DEFAULT 'ar',



            role TEXT DEFAULT 'user',



            banned INTEGER DEFAULT 0,



            created_at DATETIME DEFAULT CURRENT_TIMESTAMP



        )



        `);












        // ===============================
        // Channels Table
        // ===============================







        await run(`



        CREATE TABLE IF NOT EXISTS channels (




            id INTEGER PRIMARY KEY AUTOINCREMENT,



            user_id INTEGER,



            telegram_id TEXT,



            title TEXT,



            link TEXT,



            category TEXT DEFAULT 'general',



            subscribers INTEGER DEFAULT 0,



            status TEXT DEFAULT 'pending',



            created_at DATETIME DEFAULT CURRENT_TIMESTAMP




        )



        `);













        // ===============================
        // Campaigns Table
        // ===============================







        await run(`




        CREATE TABLE IF NOT EXISTS campaigns (




            id INTEGER PRIMARY KEY AUTOINCREMENT,



            user_id INTEGER,



            content TEXT,



            media TEXT,



            media_type TEXT,



            link TEXT,



            category TEXT DEFAULT 'general',



            budget REAL DEFAULT 0,



            status TEXT DEFAULT 'pending',



            created_at DATETIME DEFAULT CURRENT_TIMESTAMP




        )



        `);














        // ===============================
        // Transactions Table
        // ===============================







        await run(`




        CREATE TABLE IF NOT EXISTS transactions (




            id INTEGER PRIMARY KEY AUTOINCREMENT,



            user_id INTEGER,



            type TEXT,



            amount REAL DEFAULT 0,



            txid TEXT,



            address TEXT,



            status TEXT DEFAULT 'pending',



            created_at DATETIME DEFAULT CURRENT_TIMESTAMP




        )



        `);














        console.log(

        "Database Tables Ready 🚀"

        );









    }

    catch(error){





        console.log(

        "Database Init Error",

        error

        );






    }







}












// ===============================
// Start Initialization
// ===============================







initializeDatabase();

/* =====================================================
   Telega.ads Backend
   database.js - Part 3
   Users Database Functions
====================================================== */







// ===============================
// User Functions
// ===============================







async function createUser(user){






    if(!user)
    return;









    await run(



    `

    INSERT INTO users

    (

        id,

        username,

        first_name,

        last_name,

        language

    )


    VALUES (?,?,?,?,?)



    ON CONFLICT(id)

    DO UPDATE SET



    username=?,

    first_name=?,

    last_name=?



    `,





    [




    user.id,

    user.username || "",

    user.first_name || "",

    user.last_name || "",

    user.language || "ar",



    user.username || "",

    user.first_name || "",

    user.last_name || ""




    ]





    );







    return await getUser(
    user.id
    );







}











// ===============================
// Get User
// ===============================







async function getUser(id){





    return await get(




    `

    SELECT *

    FROM users

    WHERE id=?

    `,



    [

    id

    ]



    );






}











// ===============================
// Update User
// ===============================







async function updateUser(

id,

data

){





    if(!data)
    return;









    await run(



    `

    UPDATE users


    SET



    username=?,

    first_name=?,

    last_name=?,

    language=?



    WHERE id=?



    `,




    [





    data.username || "",

    data.first_name || "",

    data.last_name || "",

    data.language || "ar",



    id




    ]



    );








    return await getUser(id);







}











// ===============================
// Ban User
// ===============================







async function banUser(id){






    await run(



    `

    UPDATE users

    SET banned=1

    WHERE id=?


    `,



    [

    id

    ]



    );







}











// ===============================
// Unban User
// ===============================







async function unbanUser(id){






    await run(




    `

    UPDATE users

    SET banned=0

    WHERE id=?



    `,



    [

    id

    ]



    );







}











// ===============================
// Get All Users
// ===============================







async function getUsers(){






    return await all(




    `

    SELECT *

    FROM users

    ORDER BY created_at DESC


    `




    );






}












// ===============================
// Export User API
// ===============================







module.exports.createUser =
createUser;






module.exports.getUser =
getUser;






module.exports.updateUser =
updateUser;






module.exports.banUser =
banUser;






module.exports.unbanUser =
unbanUser;






module.exports.getUsers =
getUsers;

/* =====================================================
   Telega.ads Backend
   database.js - Part 4
   Channels Database Functions
====================================================== */







// ===============================
// Channel Functions
// ===============================







async function createChannel(data){






    if(!data)
    return;








    const result =

    await run(



    `

    INSERT INTO channels

    (

        user_id,

        telegram_id,

        title,

        link,

        category,

        subscribers,

        status

    )


    VALUES (?,?,?,?,?,?,?)



    `,



    [




    data.user_id,

    data.telegram_id || "",

    data.title || "",

    data.link || "",

    data.category || "general",

    data.subscribers || 0,

    "pending"




    ]



    );









    return result.lastID;







}











// ===============================
// Get User Channels
// ===============================







async function getUserChannels(userId){






    return await all(




    `

    SELECT *

    FROM channels

    WHERE user_id=?


    ORDER BY id DESC



    `,



    [

    userId

    ]



    );







}











// ===============================
// Get All Channels
// ===============================







async function getChannels(){






    return await all(




    `

    SELECT *

    FROM channels

    ORDER BY id DESC


    `





    );







}












// ===============================
// Update Channel Status
// ===============================







async function updateChannelStatus(

id,

status

){






    await run(




    `

    UPDATE channels

    SET status=?

    WHERE id=?



    `,



    [


    status,

    id


    ]



    );







}












// ===============================
// Update Category
// ===============================







async function updateChannelCategory(

id,

category

){





    await run(




    `

    UPDATE channels

    SET category=?

    WHERE id=?


    `,



    [

    category,

    id

    ]



    );







}












// ===============================
// Delete Channel
// ===============================







async function deleteChannel(id){






    await run(




    `

    DELETE FROM channels

    WHERE id=?



    `,



    [

    id

    ]



    );







}












// ===============================
// Export Channels API
// ===============================







module.exports.createChannel =
createChannel;






module.exports.getUserChannels =
getUserChannels;






module.exports.getChannels =
getChannels;






module.exports.updateChannelStatus =
updateChannelStatus;






module.exports.updateChannelCategory =
updateChannelCategory;






module.exports.deleteChannel =
deleteChannel;

/* =====================================================
   Telega.ads Backend
   database.js - Part 5
   Campaigns Database Functions
====================================================== */







// ===============================
// Campaign Functions
// ===============================







async function createCampaign(data){






    if(!data)
    return;









    const result =

    await run(




    `

    INSERT INTO campaigns


    (

        user_id,

        content,

        media,

        media_type,

        link,

        category,

        budget,

        status

    )


    VALUES (?,?,?,?,?,?,?,?)



    `,



    [





    data.user_id,

    data.content || "",

    data.media || "",

    data.media_type || "",

    data.link || "",

    data.category || "general",

    data.budget || 0,

    "pending"





    ]



    );








    return result.lastID;







}











// ===============================
// Get User Campaigns
// ===============================







async function getUserCampaigns(

userId

){





    return await all(





    `

    SELECT *

    FROM campaigns

    WHERE user_id=?


    ORDER BY id DESC



    `,



    [

    userId

    ]



    );








}











// ===============================
// Get All Campaigns
// ===============================







async function getCampaigns(){






    return await all(




    `

    SELECT *

    FROM campaigns

    ORDER BY id DESC


    `





    );







}











// ===============================
// Find Campaign
// ===============================







async function getCampaign(id){






    return await get(




    `

    SELECT *

    FROM campaigns

    WHERE id=?


    `,



    [

    id

    ]



    );







}











// ===============================
// Update Campaign Status
// ===============================







async function updateCampaignStatus(

id,

status

){





    await run(




    `

    UPDATE campaigns

    SET status=?

    WHERE id=?


    `,



    [

    status,

    id

    ]



    );







}












// ===============================
// Update Campaign Budget
// ===============================







async function updateCampaignBudget(

id,

budget

){






    await run(




    `

    UPDATE campaigns

    SET budget=?

    WHERE id=?


    `,



    [

    budget,

    id

    ]



    );







}











// ===============================
// Delete Campaign
// ===============================







async function deleteCampaign(id){





    await run(




    `

    DELETE FROM campaigns

    WHERE id=?


    `,



    [

    id

    ]



    );







}











// ===============================
// Export Campaign API
// ===============================







module.exports.createCampaign =
createCampaign;






module.exports.getUserCampaigns =
getUserCampaigns;






module.exports.getCampaigns =
getCampaigns;






module.exports.getCampaign =
getCampaign;






module.exports.updateCampaignStatus =
updateCampaignStatus;






module.exports.updateCampaignBudget =
updateCampaignBudget;






module.exports.deleteCampaign =
deleteCampaign;

/* =====================================================
   Telega.ads Backend
   database.js - Part 6
   Wallet + Transactions Functions
====================================================== */







// ===============================
// Transaction Functions
// ===============================







async function createTransaction(data){






    if(!data)
    return;









    const result =

    await run(





    `

    INSERT INTO transactions


    (

        user_id,

        type,

        amount,

        txid,

        address,

        status

    )


    VALUES (?,?,?,?,?,?)



    `,




    [





    data.user_id,

    data.type || "",

    data.amount || 0,

    data.txid || "",

    data.address || "",

    "pending"





    ]



    );








    return result.lastID;







}












// ===============================
// Get User Transactions
// ===============================







async function getUserTransactions(

userId

){






    return await all(




    `

    SELECT *

    FROM transactions

    WHERE user_id=?


    ORDER BY id DESC



    `,



    [

    userId

    ]



    );







}











// ===============================
// Get All Transactions
// ===============================







async function getTransactions(){






    return await all(




    `

    SELECT *

    FROM transactions

    ORDER BY id DESC


    `




    );







}











// ===============================
// Update Transaction Status
// ===============================







async function updateTransactionStatus(

id,

status

){






    await run(





    `

    UPDATE transactions

    SET status=?

    WHERE id=?



    `,



    [

    status,

    id

    ]



    );







}












// ===============================
// Calculate Balance
// ===============================







async function getBalance(

userId

){





    const deposits =

    await get(





    `

    SELECT

    IFNULL(

    SUM(amount),

    0

    )

    AS total


    FROM transactions


    WHERE

    user_id=?

    AND

    type='deposit'


    AND

    status='approved'



    `,



    [

    userId

    ]



    );








    const withdraws =

    await get(





    `

    SELECT

    IFNULL(

    SUM(amount),

    0

    )

    AS total


    FROM transactions


    WHERE

    user_id=?

    AND

    type='withdraw'


    AND

    status='approved'



    `,



    [

    userId

    ]



    );








    return (

    Number(deposits.total)

    -

    Number(withdraws.total)

    );








}













// ===============================
// Export Wallet API
// ===============================







module.exports.createTransaction =
createTransaction;






module.exports.getUserTransactions =
getUserTransactions;






module.exports.getTransactions =
getTransactions;






module.exports.updateTransactionStatus =
updateTransactionStatus;






module.exports.getBalance =
getBalance;












// ===============================
// Database Completed
// ===============================







console.log(`



=================================

Telega.ads Database Completed 🚀


SQLite Ready


Tables:

✔ users

✔ channels

✔ campaigns

✔ transactions


=================================


`);

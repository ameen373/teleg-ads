/* =====================================================
   Telega.ads Backend
   server.js - Part 1
   Express Core + Server Setup
====================================================== */


/* =====================================================
   Telega.ads Backend
   server.js
   Database Connection Upgrade
====================================================== */



require("dotenv").config();



const database =
require("./database");



const {

    createUser,
    getUser,
    updateUser,
    banUser,
    unbanUser,

    createChannel,
    getUserChannels,
    getChannels,
    updateChannelStatus,
    deleteChannel,

    createCampaign,
    getUserCampaigns,
    getCampaigns,
    updateCampaignStatus,
    deleteCampaign,

    createTransaction,
    getUserTransactions,
    getBalance,
    updateTransactionStatus

} = database;




// ===============================
// Imports
// ===============================



const express =
require("express");



const cors =
require("cors");



const path =
require("path");




require("dotenv").config();


// ===============================
// App Setup
// ===============================



const app =
express();





const PORT =
process.env.PORT || 3000;








// ===============================
// Middleware
// ===============================






app.use(
cors()
);







app.use(
express.json({
    limit:"10mb"
})
);








app.use(
express.urlencoded({

    extended:true

})
);








// ===============================
// Static Frontend
// ===============================







app.use(

express.static(

path.join(
__dirname,
"../"
)

)

);









// ===============================
// App Info
// ===============================






const APP_CONFIG = {




    name:

    "Telega.ads",




    version:

    "1.0.0",




    environment:

    "production"






};









// ===============================
// Health Check
// ===============================







app.get(
"/api/status",

(req,res)=>{






    res.json({




        success:true,



        app:
        APP_CONFIG,



        message:
        "Telega.ads Backend Running 🚀"





    });







}

);











// ===============================
// Error Handler Base
// ===============================






app.use(

(
err,
req,
res,
next
)=>{






    console.log(
    "Server Error:",
    err
    );







    res.status(500)
    .json({




        success:false,



        message:
        "Internal Server Error"




    });







}

);











// ===============================
// Global Variables
// ===============================







global.TelegaAds = {




    config:
    APP_CONFIG,



    startTime:
    new Date()




};









// ===============================
// Server Start
// ===============================






app.listen(

PORT,

()=>{






    console.log(`



    =========================

    Telega.ads Backend 🚀


    Port:
    ${PORT}


    Version:
    ${APP_CONFIG.version}


    =========================


    `);







}

);

/* =====================================================
   Telega.ads Backend
   server.js - Part 2
   Telegram WebApp Authentication
====================================================== */







// ===============================
// Telegram Config
// ===============================







const crypto =
require("crypto");








const TELEGRAM_CONFIG = {




    botUsername:

    "Ads_telegabot",





    botToken:

    process.env
    .TELEGRAM_BOT_TOKEN || ""





};












// ===============================
// Validate Telegram Data
// ===============================







function validateTelegramData(
initData
){






    if(!initData)
    return false;







    if(
    !TELEGRAM_CONFIG.botToken
    ){


        console.log(
        "Telegram Token Missing"
        );


        return false;



    }









    const params =
    new URLSearchParams(
    initData
    );








    const hash =
    params.get(
    "hash"
    );









    params.delete(
    "hash"
    );









    const dataCheckString =

    Array.from(
    params.entries()
    )

    .sort()

    .map(

    ([key,value])=>

    `${key}=${value}`

    )

    .join(
    "\n"
    );









    const secretKey =

    crypto
    .createHash(
    "sha256"
    )

    .update(
    TELEGRAM_CONFIG.botToken
    )

    .digest();









    const checkHash =

    crypto
    .createHmac(
    "sha256",
    secretKey
    )

    .update(
    dataCheckString
    )

    .digest(
    "hex"
    );









    return (
    checkHash === hash
    );






}









// ===============================
// Extract Telegram User
// ===============================







function getTelegramUser(
initData
){






    try{






        const params =
        new URLSearchParams(
        initData
        );







        const user =
        JSON.parse(
        params.get(
        "user"
        )
        );








        return user;






    }

    catch(error){



        return null;



    }








}











// ===============================
// Authentication Middleware
// ===============================







function telegramAuth(
req,
res,
next
){






    const initData =
    req.headers
    ["x-telegram-init-data"];







    if(
    !initData
    ){






        return res.status(401)
        .json({




            success:false,


            message:
            "Telegram data missing"




        });






    }









    const valid =
    validateTelegramData(
    initData
    );








    if(!valid){





        return res.status(403)
        .json({



            success:false,



            message:
            "Invalid Telegram Data"




        });







    }









    const user =
    getTelegramUser(
    initData
    );









    if(!user){



        return res.status(400)
        .json({


            success:false,


            message:
            "User not found"



        });



    }









    req.telegramUser =
    user;








    next();






}









// ===============================
// Auth Test Route
// ===============================







app.get(

"/api/auth/test",

telegramAuth,


(req,res)=>{






    res.json({




        success:true,



        user:
        req.telegramUser




    });






}

);












// ===============================
// Export Auth
// ===============================






global.TelegramAuth = {




    middleware:

    telegramAuth,



    validate:

    validateTelegramData




};

/* =====================================================
   Telega.ads Backend
   server.js - Part 3
   SQLite Database + Users System
====================================================== */







// ===============================
// SQLite
// ===============================



const sqlite3 =
require("sqlite3")
.verbose();








const dbPath =
path.join(
__dirname,
"telega_ads.db"
);








const db =
new sqlite3.Database(
dbPath
);











// ===============================
// Database Helper
// ===============================







function runSQL(
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









function getSQL(
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









function allSQL(
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
// Create Tables
// ===============================







async function createDatabase(){





    await runSQL(`



    CREATE TABLE IF NOT EXISTS users (


        id INTEGER PRIMARY KEY,


        username TEXT,


        first_name TEXT,


        last_name TEXT,


        language TEXT DEFAULT 'ar',


        role TEXT DEFAULT 'user',


        banned INTEGER DEFAULT 0,


        created_at DATETIME DEFAULT CURRENT_TIMESTAMP



    )


    `);









    await runSQL(`



    CREATE TABLE IF NOT EXISTS channels (



        id INTEGER PRIMARY KEY AUTOINCREMENT,


        user_id INTEGER,


        telegram_id TEXT,


        title TEXT,


        link TEXT,


        category TEXT,


        status TEXT DEFAULT 'pending',


        subscribers INTEGER DEFAULT 0,


        created_at DATETIME DEFAULT CURRENT_TIMESTAMP



    )


    `);









    await runSQL(`



    CREATE TABLE IF NOT EXISTS campaigns (



        id INTEGER PRIMARY KEY AUTOINCREMENT,


        user_id INTEGER,


        content TEXT,


        media TEXT,


        link TEXT,


        category TEXT,


        budget REAL DEFAULT 0,


        status TEXT DEFAULT 'pending',


        created_at DATETIME DEFAULT CURRENT_TIMESTAMP



    )


    `);










    await runSQL(`



    CREATE TABLE IF NOT EXISTS transactions (



        id INTEGER PRIMARY KEY AUTOINCREMENT,


        user_id INTEGER,


        type TEXT,


        amount REAL,


        txid TEXT,


        address TEXT,


        status TEXT DEFAULT 'pending',


        created_at DATETIME DEFAULT CURRENT_TIMESTAMP



    )


    `);







    console.log(
    "Database Ready 🚀"
    );







}









// Start Database



createDatabase();











/* =====================================================
   Telega.ads Backend
   server.js Upgrade
   Users API Using database.js
====================================================== */







// ===============================
// User Login
// ===============================







app.post(

"/api/users/login",

telegramAuth,


async(req,res)=>{





    try{





        const user =

        await createUser(

        req.telegramUser

        );







        res.json({




            success:true,



            user




        });






    }

    catch(error){





        res.status(500)
        .json({



            success:false,

            message:
            "User creation failed"



        });







    }






}

);











// ===============================
// Current User
// ===============================







app.get(

"/api/users/me",

telegramAuth,


async(req,res)=>{






    try{





        const user =

        await getUser(

        req.telegramUser.id

        );







        res.json({



            success:true,

            user



        });







    }

    catch(error){





        res.status(500)
        .json({



            success:false



        });






    }







}

);











// ===============================
// User Status
// ===============================







app.get(

"/api/users/status",

telegramAuth,


async(req,res)=>{





    try{





        const user =

        await getUser(

        req.telegramUser.id

        );








        res.json({





            success:true,



            banned:

            user.banned,



            role:

            user.role





        });






    }

    catch(error){





        res.status(500)
        .json({



            success:false



        });






    }







}

);



// ===============================
// Get User
// ===============================







app.get(

"/api/users/me",

telegramAuth,


async(req,res)=>{






    const user =

    await getSQL(

    `

    SELECT *

    FROM users

    WHERE id=?

    `,

    [
    req.telegramUser.id
    ]

    );








    res.json({



        success:true,

        user



    });







}

);











// ===============================
// Ban Check
// ===============================







app.get(

"/api/users/status",

telegramAuth,


async(req,res)=>{





    const user =

    await getSQL(

    `

    SELECT banned,role

    FROM users

    WHERE id=?

    `,

    [
    req.telegramUser.id
    ]

    );








    res.json({



        success:true,

        status:user



    });







}

);

/* =====================================================
   Telega.ads Backend
   server.js - Part 4
   Channels + Campaigns API
====================================================== */




/* =====================================================
   Telega.ads Backend
   server.js Upgrade
   Channels + Campaigns Using database.js
====================================================== */







// ===============================
// Add Channel
// ===============================







app.post(

"/api/channels/add",

telegramAuth,


async(req,res)=>{





    try{






        const id =

        await createChannel({




            user_id:

            req.telegramUser.id,



            telegram_id:

            req.body.telegram_id,



            title:

            req.body.title,



            link:

            req.body.link,



            category:

            req.body.category,



            subscribers:

            req.body.subscribers





        });









        res.json({




            success:true,

            id





        });







    }

    catch(error){






        res.status(500)
        .json({



            success:false



        });






    }







}

);











// ===============================
// My Channels
// ===============================







app.get(

"/api/channels/my",

telegramAuth,


async(req,res)=>{






    const channels =

    await getUserChannels(

    req.telegramUser.id

    );







    res.json({



        success:true,

        channels



    });







}

);











// ===============================
// Channel Status
// ===============================







app.post(

"/api/channels/status",

telegramAuth,


async(req,res)=>{





    await updateChannelStatus(


    req.body.id,


    req.body.status


    );








    res.json({



        success:true



    });







}

);











// ===============================
// Delete Channel
// ===============================







app.delete(

"/api/channels/:id",

telegramAuth,


async(req,res)=>{





    await deleteChannel(

    req.params.id

    );







    res.json({



        success:true



    });







}

);











// ===============================
// Create Campaign
// ===============================







app.post(

"/api/campaigns/create",

telegramAuth,


async(req,res)=>{





    const id =

    await createCampaign({





        user_id:

        req.telegramUser.id,



        content:

        req.body.content,



        media:

        req.body.media,



        media_type:

        req.body.media_type,



        link:

        req.body.link,



        category:

        req.body.category,



        budget:

        req.body.budget





    });








    res.json({



        success:true,

        id





    });







}

);











// ===============================
// My Campaigns
// ===============================







app.get(

"/api/campaigns/my",

telegramAuth,


async(req,res)=>{





    const campaigns =

    await getUserCampaigns(

    req.telegramUser.id

    );







    res.json({



        success:true,

        campaigns



    });







}

);











// ===============================
// Campaign Status
// ===============================







app.post(

"/api/campaigns/status",

telegramAuth,


async(req,res)=>{





    await updateCampaignStatus(


    req.body.id,


    req.body.status


    );







    res.json({



        success:true



    });







}

);











// ===============================
// Delete Campaign
// ===============================







app.delete(

"/api/campaigns/:id",

telegramAuth,


async(req,res)=>{





    await deleteCampaign(

    req.params.id

    );







    res.json({



        success:true



    });







}

);



// ===============================
// Get My Channels
// ===============================







app.get(

"/api/channels/my",

telegramAuth,


async(req,res)=>{





    const channels =

    await allSQL(



    `

    SELECT *

    FROM channels

    WHERE user_id=?

    `,



    [

    req.telegramUser.id

    ]



    );








    res.json({



        success:true,


        channels



    });







}

);











// ===============================
// Admin Approve Channel
// ===============================







app.post(

"/api/channels/status",

telegramAuth,


async(req,res)=>{





    const {

        id,

        status

    } = req.body;









    await runSQL(

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








    res.json({



        success:true



    });







}

);



// ===============================
// Get My Campaigns
// ===============================







app.get(

"/api/campaigns/my",

telegramAuth,


async(req,res)=>{






    const campaigns =

    await allSQL(



    `

    SELECT *

    FROM campaigns

    WHERE user_id=?

    `,



    [

    req.telegramUser.id

    ]



    );







    res.json({



        success:true,

        campaigns



    });







}

);









// ===============================
// Campaign Status
// ===============================







app.post(

"/api/campaigns/status",

telegramAuth,


async(req,res)=>{





    const {

        id,

        status

    } = req.body;









    await runSQL(

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








    res.json({



        success:true



    });







}

);









// ===============================
// Remove Channel
// ===============================







app.delete(

"/api/channels/:id",

telegramAuth,


async(req,res)=>{





    await runSQL(

    `

    DELETE FROM channels

    WHERE id=?

    `,

    [

    req.params.id

    ]

    );








    res.json({



        success:true



    });






}

);









// ===============================
// Remove Campaign
// ===============================







app.delete(

"/api/campaigns/:id",

telegramAuth,


async(req,res)=>{





    await runSQL(

    `

    DELETE FROM campaigns

    WHERE id=?

    `,

    [

    req.params.id

    ]

    );








    res.json({



        success:true



    });






}

);

/* =====================================================
   Telega.ads Backend
   server.js - Part 5
   Wallet + Transactions API
====================================================== */





/* =====================================================
   Telega.ads Backend
   server.js Upgrade
   Wallet + Final Controller
====================================================== */







// ===============================
// Wallet Info
// ===============================







app.get(

"/api/wallet",

telegramAuth,


async(req,res)=>{





    try{





        const balance =

        await getBalance(

        req.telegramUser.id

        );







        const transactions =

        await getUserTransactions(

        req.telegramUser.id

        );







        res.json({




            success:true,



            balance,



            transactions





        });







    }

    catch(error){





        res.status(500)
        .json({



            success:false



        });






    }







}

);











// ===============================
// Deposit Request
// ===============================







app.post(

"/api/wallet/deposit",

telegramAuth,


async(req,res)=>{





    const id =

    await createTransaction({





        user_id:

        req.telegramUser.id,



        type:

        "deposit",



        amount:

        req.body.amount,



        txid:

        req.body.txid





    });








    res.json({



        success:true,

        id





    });







}

);











// ===============================
// Withdraw Request
// ===============================







app.post(

"/api/wallet/withdraw",

telegramAuth,


async(req,res)=>{





    const id =

    await createTransaction({





        user_id:

        req.telegramUser.id,



        type:

        "withdraw",



        amount:

        req.body.amount,



        address:

        req.body.address





    });








    res.json({



        success:true,

        id





    });







}

);












// ===============================
// Transaction History
// ===============================







app.get(

"/api/wallet/history",

telegramAuth,


async(req,res)=>{






    const list =

    await getUserTransactions(

    req.telegramUser.id

    );







    res.json({



        success:true,

        transactions:list



    });







}

);











// ===============================
// Admin Transaction Status
// ===============================







app.post(

"/api/admin/transaction/status",

telegramAuth,


async(req,res)=>{





    await updateTransactionStatus(


    req.body.id,


    req.body.status


    );







    res.json({



        success:true



    });







}

);











// ===============================
// Final API 404
// ===============================







app.use(

(req,res)=>{





    res.status(404)
    .json({




        success:false,

        message:

        "API Not Found"




    });







}

);











// ===============================
// Final Export
// ===============================







module.exports = app;








console.log(`



=================================

Telega.ads Backend Updated 🚀


Express

SQLite

Telegram Bot

Wallet System


Ready


=================================


`);




// ===============================
// Deposit Request
// ===============================







app.post(

"/api/wallet/deposit",

telegramAuth,


async(req,res)=>{





    const user =
    req.telegramUser;







    const {

        amount,

        txid

    } = req.body;








    if(

    !amount ||

    !txid

    ){





        return res.json({



            success:false,

            message:
            "Missing Data"



        });





    }









    const result =

    await runSQL(

    `

    INSERT INTO transactions


    (

        user_id,

        type,

        amount,

        txid,

        status

    )


    VALUES (?,?,?,?,?)



    `,



    [



    user.id,

    "deposit",

    amount,

    txid,

    "pending"



    ]



    );








    res.json({



        success:true,


        id:

        result.lastID



    });







}

);












// ===============================
// Withdraw Request
// ===============================







app.post(

"/api/wallet/withdraw",

telegramAuth,


async(req,res)=>{





    const user =
    req.telegramUser;







    const {

        amount,

        address

    } = req.body;








    if(

    !amount ||

    !address

    ){





        return res.json({



            success:false



        });





    }








    const balance =

    await getSQL(

    `

    SELECT

    IFNULL(

    SUM(amount),

    0

    )

    AS balance


    FROM transactions


    WHERE

    user_id=?

    AND

    type='deposit'


    AND

    status='approved'


    `,

    [

    user.id

    ]

    );









    if(

    Number(amount)

    >

    Number(balance.balance)

    ){






        return res.json({



            success:false,

            message:

            "Insufficient Balance"



        });







    }








    const result =

    await runSQL(

    `

    INSERT INTO transactions


    (

        user_id,

        type,

        amount,

        address,

        status

    )


    VALUES (?,?,?,?,?)



    `,



    [



    user.id,

    "withdraw",

    amount,

    address,

    "pending"



    ]



    );








    res.json({



        success:true,


        id:

        result.lastID



    });








}

);












// ===============================
// Admin Approve Transaction
// ===============================







app.post(

"/api/admin/transaction/status",

telegramAuth,


async(req,res)=>{





    const {

        id,

        status

    } = req.body;








    await runSQL(

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








    res.json({



        success:true



    });







}

);











// ===============================
// Transaction History
// ===============================







app.get(

"/api/wallet/history",

telegramAuth,


async(req,res)=>{






    const list =

    await allSQL(

    `

    SELECT *

    FROM transactions

    WHERE user_id=?

    ORDER BY id DESC


    `,

    [

    req.telegramUser.id

    ]

    );







    res.json({



        success:true,

        transactions:list



    });







}

);

/* =====================================================
   Telega.ads Backend
   server.js - Part 6
   Telegram Bot + Final Controller
====================================================== */







// ===============================
// Telegram Bot API
// ===============================







const TelegramBot =
require("node-telegram-bot-api");








let bot = null;









if(
TELEGRAM_CONFIG.botToken
){





    bot = new TelegramBot(

    TELEGRAM_CONFIG.botToken,

    {
        polling:true
    }

    );





    console.log(
    "Telegram Bot Connected 🚀"
    );






}









// ===============================
// Bot Start Command
// ===============================







if(bot){





    bot.onText(

    /\/start/,

    (msg)=>{






        bot.sendMessage(



        msg.chat.id,



        `

مرحبا بك في Telega.ads 🚀


منصة الإعلانات داخل Telegram

        `,



        {

        reply_markup:{

        inline_keyboard:[


            [


                {

                text:
                "فتح المنصة 🚀",


                web_app:{

                url:
                process.env.APP_URL || ""

                }


                }


            ]


        ]


        }



        );







    }



    );







}









// ===============================
// Publish Advertisement
// ===============================







app.post(

"/api/telegram/publish",

telegramAuth,


async(req,res)=>{






    if(!bot){





        return res.json({



            success:false,

            message:
            "Bot not connected"



        });






    }








    const {

        channel,

        message,

        media,

        mediaType


    } = req.body;









    const keyboard = {




        inline_keyboard:[


            [


                {


                text:

                "Telega.ads 🚀",



                url:

                "https://t.me/Ads_telegabot"



                }


            ]



        ]




    };








    try{





        if(
        mediaType==="photo"
        ){






            await bot.sendPhoto(



            channel,

            media,

            {


            caption:
            message,



            reply_markup:
            keyboard



            }



            );






        }







        else if(
        mediaType==="video"
        ){







            await bot.sendVideo(



            channel,

            media,

            {


            caption:
            message,



            reply_markup:
            keyboard



            }



            );







        }








        else{







            await bot.sendMessage(



            channel,

            message,



            {


            reply_markup:
            keyboard



            }



            );








        }









        res.json({



            success:true,


            message:
            "Published"




        });







    }

    catch(error){





        res.json({



            success:false,


            error:
            error.message



        });






    }








}

);











// ===============================
// Bot Admin Check
// ===============================







app.post(

"/api/telegram/check-admin",

telegramAuth,


async(req,res)=>{






    if(!bot){


        return res.json({

            success:false

        });


    }








    try{






        const member =

        await bot.getChatMember(



        req.body.channel,



        req.telegramUser.id



        );









        res.json({



            success:


            (

            member.status==="administrator"

            ||

            member.status==="creator"

            )




        });







    }

    catch(error){






        res.json({



            success:false



        });






    }







}

);












// ===============================
// Admin Statistics
// ===============================







app.get(

"/api/admin/stats",

telegramAuth,


async(req,res)=>{






    const users =

    await getSQL(

    `

    SELECT COUNT(*) as total

    FROM users


    `

    );








    const channels =

    await getSQL(

    `

    SELECT COUNT(*) as total

    FROM channels


    `

    );








    const campaigns =

    await getSQL(

    `

    SELECT COUNT(*) as total

    FROM campaigns


    `

    );








    res.json({




        success:true,



        users:

        users.total,



        channels:

        channels.total,



        campaigns:

        campaigns.total





    });







}

);









// ===============================
// 404 Handler
// ===============================







app.use(

(req,res)=>{





    res.status(404)
    .json({




        success:false,


        message:
        "API Not Found"




    });






}

);









// ===============================
// Final Export
// ===============================







module.exports = app;









console.log(`



=================================

Telega.ads Backend Completed 🚀


Frontend:
index.html
style.css
app.js


Backend:
Express
SQLite
Telegram Bot API


=================================


`);

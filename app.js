/* =====================================================
   Telega.ads Mini App
   app.js - Part 1
   Core Engine + Telegram Init + State
====================================================== */







// ===============================
// Telegram WebApp Initialization
// ===============================



const TelegramApp =
window.Telegram?.WebApp || null;





if(TelegramApp){


    TelegramApp.ready();


    TelegramApp.expand();


}









// ===============================
// Application State
// ===============================



const AppState = {



    app:{


        name:
        "Telega.ads",


        version:
        "1.0.0",


        initialized:false



    },






    user:{



        id:null,


        username:"",


        first_name:"",


        last_name:"",


        language:"ar",


        banned:false,


        role:"user"



    },







    publisher:{



        channels:[]



    },







    advertiser:{



        campaigns:[]



    },







    wallet:{



        balance:0,


        transactions:[]



    },







    admin:{



        active:false



    }






};











// ===============================
// Storage System
// ===============================



const Storage = {



    key:
    "telega_ads_data",






    save(){



        localStorage.setItem(

            this.key,

            JSON.stringify(AppState)

        );



    },







    load(){



        const data =
        localStorage.getItem(
        this.key
        );





        if(!data)
        return;






        try{



            const parsed =
            JSON.parse(data);





            Object.assign(
            AppState,
            parsed
            );



        }
        catch(error){


            console.log(
            "Storage Error",
            error
            );


        }





    },







    clear(){



        localStorage.removeItem(
        this.key
        );



    }





};












// Load Saved Data


Storage.load();









// ===============================
// Telegram User Loader
// ===============================



function loadTelegramUser(){



    if(!TelegramApp)
    return;







    const tgUser =
    TelegramApp.initDataUnsafe
    ?.user;







    if(!tgUser)
    return;







    AppState.user.id =
    tgUser.id;





    AppState.user.username =
    tgUser.username || "";





    AppState.user.first_name =
    tgUser.first_name || "";





    AppState.user.last_name =
    tgUser.last_name || "";






    Storage.save();





}











// ===============================
// Theme System
// ===============================



function applyTheme(){



    const dark =
    window.matchMedia(
    "(prefers-color-scheme: dark)"
    ).matches;





    if(dark){



        document.documentElement
        .setAttribute(
        "data-theme",
        "dark"
        );



    }
    else{


        document.documentElement
        .setAttribute(
        "data-theme",
        "light"
        );



    }





}










// ===============================
// Language System
// ===============================



function changeLanguage(lang){



    if(
    lang !== "ar" &&
    lang !== "en"
    )
    return;





    AppState.user.language =
    lang;






    document.documentElement
    .setAttribute(
    "lang",
    lang
    );





    document.documentElement
    .setAttribute(
    "dir",
    lang==="ar"
    ?
    "rtl"
    :
    "ltr"
    );









    document
    .querySelectorAll(
    "[data-ar]"
    )
    .forEach(el=>{






        el.innerText =
        el.getAttribute(
        lang==="ar"
        ?
        "data-ar"
        :
        "data-en"
        );






    });






    Storage.save();





}











// ===============================
// Notification System
// ===============================



function showNotification(message){





    const old =
    document.querySelector(
    ".notification"
    );





    if(old)
    old.remove();







    const box =
    document.createElement(
    "div"
    );





    box.className =
    "notification";





    box.innerText =
    message;







    document.body
    .appendChild(
    box
    );








    setTimeout(()=>{



        box.remove();



    },2500);




}












// ===============================
// Page Navigation Helper
// ===============================



function hideAllPages(){





    document
    .querySelectorAll(
    ".page"
    )
    .forEach(page=>{



        page.classList
        .add("hidden");



    });





}









function openPage(id){



    hideAllPages();





    const page =
    document.getElementById(
    id
    );





    if(page){



        page.classList
        .remove("hidden");



    }




}









function openDashboard(){



    openPage(
    "dashboardSection"
    );



}











// ===============================
// API Layer Placeholder
// Ready for Backend
// ===============================



const API = {



    baseURL:
    "",






    async request(
    endpoint,
    options={}
    ){



        /*

        Future:

        fetch(
        this.baseURL + endpoint,
        options
        )


        */



        console.log(
        "API Request:",
        endpoint
        );



        return null;



    }




};











// ===============================
// Startup
// ===============================



function initializeApp(){



    loadTelegramUser();


    applyTheme();



    AppState.app.initialized =
    true;





    Storage.save();





    console.log(
    "Telega.ads Started 🚀"
    );



}











// Start App


document.addEventListener(

"DOMContentLoaded",

initializeApp

);

/* =====================================================
   Telega.ads Mini App
   app.js - Part 2
   User System + Permissions
====================================================== */







// ===============================
// User System
// ===============================






function getCurrentUser(){



    return AppState.user;



}









function updateUser(data){





    if(!data)
    return;






    Object.keys(data)
    .forEach(key=>{



        if(
        AppState.user
        .hasOwnProperty(key)
        ){


            AppState.user[key] =
            data[key];


        }



    });






    Storage.save();





}











// ===============================
// Telegram Authentication
// ===============================






function authenticateTelegram(){





    if(!TelegramApp){



        showNotification(
        "Telegram غير متصل"
        );

        return false;


    }









    const user =
    TelegramApp
    .initDataUnsafe
    ?.user;







    if(!user){



        showNotification(
        "لم يتم العثور على المستخدم"
        );


        return false;


    }








    updateUser({




        id:
        user.id,



        username:
        user.username || "",



        first_name:
        user.first_name || "",



        last_name:
        user.last_name || ""




    });








    return true;






}









// ===============================
// User Profile
// ===============================






function getUserName(){





    if(
    AppState.user.username
    ){



        return "@"
        +
        AppState.user.username;



    }






    return (

    AppState.user.first_name
    ||
    "User"

    );






}









function renderUserProfile(){





    const name =
    document.getElementById(
    "userName"
    );





    if(name){



        name.innerText =
        getUserName();



    }






}









// ===============================
// Roles
// ===============================







function setRole(role){






    const roles = [

        "user",

        "publisher",

        "advertiser",

        "admin"

    ];







    if(
    !roles.includes(role)
    )
    return;






    AppState.user.role =
    role;






    if(role==="admin"){



        AppState.admin.active =
        true;



    }






    Storage.save();







}









function hasRole(role){





    return (
    AppState.user.role === role
    );





}











// ===============================
// Permission System
// ===============================






function canAccess(section){





    if(
    AppState.user.banned
    ){



        showNotification(
        "الحساب محظور"
        );



        return false;



    }








    switch(section){






        case "publisher":



            return true;







        case "advertiser":



            return true;







        case "admin":



            return (
            AppState.admin.active
            );







        default:



            return true;





    }






}









// ===============================
// Ban System
// ===============================






function banUser(){





    AppState.user.banned =
    true;





    Storage.save();





    showNotification(
    "تم حظر الحساب"
    );






}








function unbanUser(){





    AppState.user.banned =
    false;





    Storage.save();





    showNotification(
    "تم فك الحظر"
    );





}









function checkBanStatus(){





    if(
    AppState.user.banned
    ){



        hideAllPages();




        openGlobalModal(`



        <div class="error-box">


        حسابك محظور


        </div>



        `);




        return false;



    }







    return true;






}











// ===============================
// User Sync
// Future Backend
// ===============================






async function syncUser(){





    const user =
    getCurrentUser();







    return await API.request(

        "/user/sync",

        {


            method:"POST",



            body:
            JSON.stringify(user)




        }


    );







}












// ===============================
// Logout
// ===============================






function logoutUser(){





    Storage.clear();






    AppState.user = {


        id:null,


        username:"",


        language:"ar",


        banned:false,


        role:"user"



    };







    showNotification(
    "تم تسجيل الخروج"
    );







}









// ===============================
// Auto User Init
// ===============================






setTimeout(()=>{





    authenticateTelegram();


    renderUserProfile();


    checkBanStatus();





},500);

/* =====================================================
   Telega.ads Mini App
   app.js - Part 3
   Publisher System
====================================================== */







// ===============================
// Publisher Channel System
// ===============================







function addChannel(data){





    if(!canAccess("publisher"))
    return;







    if(!data)
    return;







    const channel = {




        id:
        Date.now(),



        telegram_id:
        data.telegram_id || "",



        title:
        data.title || "New Channel",




        username:
        data.username || "",




        link:
        data.link || "",




        subscribers:
        data.subscribers || 0,




        category:
        data.category || "general",




        status:
        "pending",





        created:
        new Date()
        .toLocaleDateString()





    };








    AppState.publisher.channels
    .push(channel);







    Storage.save();







    renderChannels();







    showNotification(
    "تم إضافة القناة"
    );







}











// ===============================
// Verify Bot Admin
// ===============================







async function verifyBotAdmin(channelId){






    const channel =
    AppState.publisher.channels
    .find(
    c=>c.id===channelId
    );






    if(!channel)
    return false;







    /*

    سيتم استبداله لاحقاً:

    Telegram Bot API

    getChatMember

    */




    const result =
    await API.request(

    "/telegram/check-admin",

    {


        method:"POST",


        body:
        JSON.stringify({

        channel:
        channel.telegram_id


        })


    }


    );








    if(result){



        channel.status =
        "approved";



        Storage.save();




    }






    return true;






}









// ===============================
// Get Channel Info
// ===============================







async function getChannelInfo(channel){






    if(!channel)
    return null;







    /*

    Backend:

    Telegram Bot API

    getChat

    getChatMemberCount

    */







    const info = {




        title:
        channel.title,



        link:
        channel.link,



        subscribers:
        channel.subscribers





    };








    return info;






}












// ===============================
// Render Channels
// ===============================







function renderChannels(){





    const box =
    document.getElementById(
    "channelsList"
    );






    if(!box)
    return;








    box.innerHTML="";







    if(
    AppState.publisher.channels
    .length===0
    ){





        box.innerHTML = `



        <div class="empty-state">


        📢


        <p>

        لا توجد قنوات

        </p>



        </div>



        `;



        return;





    }









    AppState.publisher.channels
    .forEach(channel=>{






        box.innerHTML += `



        <div class="channel-item">





            <div>


                <h4>

                ${channel.title}

                </h4>





                <p>

                ${channel.link}

                </p>






                <small>

                ${channel.category}

                </small>





            </div>







            <div class="channel-actions">







                <button

                onclick="
                editChannelCategory(
                ${channel.id}
                )
                ">

                ✏️

                </button>








                <button

                onclick="
                deleteChannel(
                ${channel.id}
                )
                ">

                🗑️

                </button>







            </div>






        </div>



        `;






    });








}












// ===============================
// Edit Category
// ===============================







function editChannelCategory(id){






    const channel =
    AppState.publisher.channels
    .find(
    c=>c.id===id
    );






    if(!channel)
    return;







    const newCategory =
    prompt(

    "التصنيف الجديد",

    channel.category

    );







    if(
    newCategory
    ){



        channel.category =
        newCategory;



        Storage.save();



        renderChannels();



        showNotification(
        "تم تعديل التصنيف"
        );



    }






}











// ===============================
// Delete Channel
// ===============================







function deleteChannel(id){






    AppState.publisher.channels =

    AppState.publisher.channels
    .filter(
    c=>c.id!==id
    );







    Storage.save();







    renderChannels();







    showNotification(
    "تم حذف القناة"
    );








}











// ===============================
// Publisher Sync API
// ===============================







async function syncChannels(){





    return await API.request(

    "/channels/sync",

    {


        method:"POST",


        body:
        JSON.stringify(
        AppState.publisher.channels
        )


    }


    );





}









// ===============================
// Initialize Publisher
// ===============================







setTimeout(()=>{



    renderChannels();



},700);

/* =====================================================
   Telega.ads Mini App
   app.js - Part 4
   Advertiser System
====================================================== */







// ===============================
// Advertiser Campaign System
// ===============================







function createCampaign(data){





    if(!canAccess("advertiser"))
    return;







    if(!data)
    return;









    const campaign = {




        id:
        Date.now(),





        content:
        data.content || "",





        media:
        data.media || null,





        mediaType:
        data.mediaType || null,





        link:
        data.link || "",





        category:
        data.category || "general",





        budget:
        Number(
        data.budget || 0
        ),





        spent:
        0,





        status:
        "pending",





        created:
        new Date()
        .toLocaleDateString()






    };









    AppState.advertiser
    .campaigns
    .push(campaign);








    Storage.save();








    renderCampaigns();








    showNotification(
    "تم إنشاء الحملة"
    );







}












// ===============================
// Media Handler
// ===============================







function handleCampaignMedia(file){






    if(!file)
    return null;






    return new Promise(
    resolve=>{






        const reader =
        new FileReader();






        reader.onload = ()=>{



            resolve({

                url:
                reader.result,


                type:
                file.type


            });



        };





        reader.readAsDataURL(file);





    });



}












// ===============================
// Update Campaign
// ===============================







function updateCampaign(id,data){






    const campaign =
    AppState.advertiser
    .campaigns
    .find(
    c=>c.id===id
    );







    if(!campaign)
    return;









    Object.assign(
    campaign,
    data
    );






    Storage.save();






    renderCampaigns();








}












// ===============================
// Render Campaigns
// ===============================







function renderCampaigns(){





    const box =
    document.getElementById(
    "campaignsList"
    );







    if(!box)
    return;









    box.innerHTML="";








    if(
    AppState.advertiser
    .campaigns.length===0
    ){






        box.innerHTML = `



        <div class="empty-state">


        🎯


        <p>


        لا توجد حملات


        </p>



        </div>



        `;




        return;





    }









    AppState.advertiser
    .campaigns
    .forEach(c=>{








        box.innerHTML += `



        <div class="campaign-item">





            <div>




                <h4>

                حملة #${c.id}

                </h4>






                <p>

                ${c.content.substring(0,60)}

                </p>







                <span class="badge">

                ${c.status}

                </span>





            </div>







            <div>




                <button

                onclick="
                toggleCampaign(
                ${c.id}
                )
                ">


                ${

                c.status==="active"

                ?

                "⏸"

                :

                "▶️"

                }


                </button>







                <button

                onclick="
                viewCampaign(
                ${c.id}
                )
                ">


                👁️


                </button>







                <button

                onclick="
                deleteCampaign(
                ${c.id}
                )
                ">


                🗑️


                </button>





            </div>







        </div>



        `;






    });






}












// ===============================
// Toggle Campaign
// ===============================







function toggleCampaign(id){






    const campaign =
    AppState.advertiser
    .campaigns
    .find(
    c=>c.id===id
    );







    if(!campaign)
    return;









    if(
    campaign.status==="active"
    ){


        campaign.status =
        "stopped";



    }

    else{


        campaign.status =
        "active";



    }







    Storage.save();






    renderCampaigns();








}











// ===============================
// Delete Campaign
// ===============================







function deleteCampaign(id){






    AppState.advertiser
    .campaigns =

    AppState.advertiser
    .campaigns
    .filter(
    c=>c.id!==id
    );








    Storage.save();








    renderCampaigns();








    showNotification(
    "تم حذف الحملة"
    );








}












// ===============================
// Campaign Details
// ===============================







function viewCampaign(id){






    const campaign =
    AppState.advertiser
    .campaigns
    .find(
    c=>c.id===id
    );







    if(!campaign)
    return;








    openGlobalModal(`





    <h3>

    تفاصيل الحملة

    </h3>





    <p>

    ${campaign.content}

    </p>





    <p>

    الميزانية:
    ${campaign.budget}
    USDT

    </p>





    <p>

    الحالة:
    ${campaign.status}

    </p>






    `);







}












// ===============================
// Publish Ad Structure
// ===============================







function buildTelegramAd(campaign){






    if(!campaign)
    return null;







    return {




        text:


        campaign.content

        +

        "\n\nTelega.ads 🚀",






        button:{


            text:

            "Telega.ads 🚀",



            url:

            "https://t.me/Ads_telegabot"



        }





    };








}









// ===============================
// Advertiser Sync
// ===============================







async function syncCampaigns(){






    return await API.request(



    "/campaigns/sync",



    {


        method:"POST",


        body:

        JSON.stringify(
        AppState.advertiser.campaigns
        )


    }




    );







}








// Initialize Campaign View


setTimeout(()=>{



    renderCampaigns();



},800);

/* =====================================================
   Telega.ads Mini App
   app.js - Part 5
   Wallet System
====================================================== */







// ===============================
// Wallet Core
// ===============================







function getBalance(){



    return AppState.wallet.balance;



}









function updateBalance(amount){





    AppState.wallet.balance =
    Number(
    AppState.wallet.balance
    )
    +
    Number(amount);






    Storage.save();





    updateWallet();






}











// ===============================
// Transactions
// ===============================







function addTransaction(data){






    if(!data)
    return;







    const transaction = {




        id:
        Date.now(),




        type:
        data.type || "unknown",




        amount:
        Number(
        data.amount || 0
        ),




        status:
        "pending",





        txid:
        data.txid || "",





        address:
        data.address || "",





        created:

        new Date()
        .toLocaleString()






    };







    AppState.wallet
    .transactions
    .push(transaction);






    Storage.save();







    renderTransactions();






    return transaction;







}











// ===============================
// Deposit System
// ===============================







function requestDeposit(data){





    if(!data)
    return;







    if(
    !data.txid ||
    !data.amount
    ){



        showNotification(
        "أدخل بيانات الشحن"
        );


        return;


    }









    addTransaction({



        type:
        "deposit",



        txid:
        data.txid,



        amount:
        data.amount





    });









    showNotification(
    "تم إرسال طلب الشحن"
    );







}











// ===============================
// Withdraw System
// ===============================







function requestWithdraw(data){






    if(!data)
    return;








    if(
    !data.address ||
    !data.amount
    ){



        showNotification(
        "أدخل بيانات السحب"
        );



        return;



    }









    if(
    Number(data.amount)
    >
    AppState.wallet.balance
    ){



        showNotification(
        "الرصيد غير كافي"
        );


        return;



    }









    addTransaction({



        type:
        "withdraw",




        address:
        data.address,



        amount:
        data.amount





    });







    showNotification(
    "تم إنشاء طلب السحب"
    );








}












// ===============================
// Render Transactions
// ===============================







function renderTransactions(){






    const box =
    document.getElementById(
    "transactionsList"
    );






    if(!box)
    return;









    box.innerHTML="";









    if(
    AppState.wallet
    .transactions.length===0
    ){






        box.innerHTML = `



        <div class="empty-state">


        💳


        <p>


        لا توجد عمليات


        </p>



        </div>



        `;



        return;





    }








    AppState.wallet
    .transactions
    .forEach(t=>{







        box.innerHTML += `



        <div class="transaction-item">





            <div>




                <strong>

                ${

                t.type==="deposit"

                ?

                "شحن"

                :

                "سحب"

                }


                </strong>





                <p>

                ${t.amount}
                USDT

                </p>





            </div>







            <span>


            ${t.status}


            </span>







        </div>



        `;





    });








}











// ===============================
// Admin Actions
// ===============================







function approveDeposit(id){





    const transaction =
    AppState.wallet
    .transactions
    .find(
    t=>t.id===id
    );







    if(!transaction)
    return;









    if(
    transaction.status==="approved"
    )
    return;









    transaction.status =
    "approved";






    updateBalance(
    transaction.amount
    );






    Storage.save();







    renderTransactions();








    showNotification(
    "تم قبول الإيداع"
    );







}









function rejectDeposit(id){






    const transaction =
    AppState.wallet
    .transactions
    .find(
    t=>t.id===id
    );







    if(transaction){



        transaction.status =
        "rejected";



    }






    Storage.save();







    renderTransactions();







}












function approveWithdraw(id){






    const transaction =
    AppState.wallet
    .transactions
    .find(
    t=>t.id===id
    );








    if(!transaction)
    return;









    if(
    transaction.status==="approved"
    )
    return;








    transaction.status =
    "approved";







    updateBalance(
    -transaction.amount
    );







    showNotification(
    "تم قبول السحب"
    );






}








function rejectWithdraw(id){





    const transaction =
    AppState.wallet
    .transactions
    .find(
    t=>t.id===id
    );








    if(transaction){



        transaction.status =
        "rejected";



    }







    Storage.save();






}












// ===============================
// Wallet Sync API
// ===============================







async function syncWallet(){





    return await API.request(



    "/wallet/sync",



    {


        method:"POST",


        body:

        JSON.stringify(
        AppState.wallet
        )


    }


    );







}








// Initialize Wallet UI



setTimeout(()=>{



    updateWallet();


    renderTransactions();



},900);

/* =====================================================
   Telega.ads Mini App
   app.js - Part 6
   Admin Panel System
====================================================== */







// ===============================
// Admin Access
// ===============================






function enableAdmin(){





    AppState.admin.active =
    true;






    AppState.user.role =
    "admin";






    Storage.save();







    showNotification(
    "تم تفعيل لوحة الأدمن"
    );







}









function disableAdmin(){






    AppState.admin.active =
    false;





    AppState.user.role =
    "user";






    Storage.save();







}









function checkAdmin(){





    return (
    AppState.admin.active
    ===
    true
    );






}









// ===============================
// Admin Users
// ===============================







function getUsers(){





    return [

        AppState.user

    ];





}









function renderAdminUsers(){






    if(
    !checkAdmin()
    )
    return;







    const box =
    document.getElementById(
    "adminUsers"
    );






    if(!box)
    return;







    box.innerHTML="";








    getUsers()
    .forEach(user=>{







        box.innerHTML += `



        <div class="admin-item">





            <div>



                <strong>

                ${
                user.username
                ?
                "@"+user.username
                :
                user.first_name
                }

                </strong>




                <p>

                ${user.role}

                </p>



            </div>







            <button

            onclick="
            toggleBanUser()
            ">

            ${
            user.banned
            ?
            "فك الحظر"
            :
            "حظر"
            }


            </button>






        </div>



        `;






    });








}









// ===============================
// Ban User Admin
// ===============================







function toggleBanUser(){






    if(
    AppState.user.banned
    ){



        unbanUser();



    }

    else{


        banUser();



    }






    renderAdminUsers();






}









// ===============================
// Channel Approval
// ===============================







function approveChannel(id){





    const channel =
    AppState.publisher.channels
    .find(
    c=>c.id===id
    );






    if(!channel)
    return;








    channel.status =
    "approved";








    Storage.save();








    renderChannels();








    showNotification(
    "تم قبول القناة"
    );







}








function rejectChannel(id){





    const channel =
    AppState.publisher.channels
    .find(
    c=>c.id===id
    );







    if(channel){



        channel.status =
        "rejected";



    }






    Storage.save();







    renderChannels();







}









// ===============================
// Campaign Approval
// ===============================







function approveCampaign(id){






    const campaign =
    AppState.advertiser
    .campaigns
    .find(
    c=>c.id===id
    );







    if(!campaign)
    return;









    campaign.status =
    "approved";







    Storage.save();







    renderCampaigns();






    showNotification(
    "تم قبول الحملة"
    );






}









function rejectCampaign(id){





    const campaign =
    AppState.advertiser
    .campaigns
    .find(
    c=>c.id===id
    );







    if(campaign){



        campaign.status =
        "rejected";



    }








    Storage.save();







    renderCampaigns();








}









// ===============================
// Deposit / Withdraw Review
// ===============================







function reviewDeposits(){






    return AppState.wallet
    .transactions
    .filter(
    t=>

    t.type==="deposit"

    );






}









function reviewWithdrawals(){






    return AppState.wallet
    .transactions
    .filter(
    t=>

    t.type==="withdraw"

    );







}











// ===============================
// Admin Dashboard Data
// ===============================







function getAdminStats(){






    return {




        users:

        getUsers()
        .length,




        channels:

        AppState.publisher
        .channels.length,




        campaigns:

        AppState.advertiser
        .campaigns.length,




        balance:

        AppState.wallet
        .balance






    };







}









// ===============================
// Admin API
// ===============================







async function adminSync(){





    if(!checkAdmin())
    return;







    return await API.request(



    "/admin/sync",



    {


        method:"POST",


        body:

        JSON.stringify(
        getAdminStats()
        )



    }



    );






}









// Initialize Admin View


setTimeout(()=>{



    renderAdminUsers();



},1000);

/* =====================================================
   Telega.ads Mini App
   app.js - Part 7
   Telegram Bot Layer
====================================================== */







// ===============================
// Telegram Bot Configuration
// ===============================







const TelegramBotLayer = {




    botUsername:

    "Ads_telegabot",





    botURL:

    "https://t.me/Ads_telegabot",







    buttonText:

    "Telega.ads 🚀"







};












// ===============================
// Build Telega Button
// ===============================







function buildTelegaButton(){






    return {




        inline_keyboard:[


            [



                {

                    text:

                    TelegramBotLayer
                    .buttonText,



                    url:

                    TelegramBotLayer
                    .botURL



                }



            ]



        ]






    };






}












// ===============================
// Build Telegram Ad Message
// ===============================







function buildAdMessage(campaign){






    if(!campaign)
    return null;







    let message = "";







    message +=
    campaign.content;







    message +=
    "\n\n";







    message +=
    "━━━━━━━━━━━━";







    message +=
    "\n";







    message +=
    "Telega.ads 🚀";







    return {




        text:

        message,




        reply_markup:

        buildTelegaButton()





    };








}









// ===============================
// Publish Advertisement
// ===============================







async function publishAdvertisement(
campaignId,
channelId
){






    const campaign =
    AppState.advertiser
    .campaigns
    .find(
    c=>c.id===campaignId
    );








    const channel =
    AppState.publisher
    .channels
    .find(
    c=>c.id===channelId
    );







    if(
    !campaign ||
    !channel
    ){



        showNotification(
        "بيانات الإعلان غير مكتملة"
        );



        return;



    }









    const message =
    buildAdMessage(
    campaign
    );









    /*


    Backend هنا:


    Telegram Bot API

    sendMessage

    sendPhoto

    sendVideo


    */








    const result =
    await API.request(



    "/telegram/publish",



    {



        method:"POST",





        body:

        JSON.stringify({

            channel:

            channel.telegram_id,



            message:

            message



        })




    }



    );









    if(result){





        campaign.status =
        "published";






        Storage.save();






    }








    return message;







}











// ===============================
// Channel Bot Check
// ===============================







async function checkChannelBotAccess(
channel
){







    if(!channel)
    return false;







    return await API.request(



    "/telegram/check-channel",



    {


        method:"POST",


        body:

        JSON.stringify({

            channel:

            channel.telegram_id



        })



    }




    );








}











// ===============================
// Format Preview
// ===============================







function previewTelegramPost(campaignId){






    const campaign =
    AppState.advertiser
    .campaigns
    .find(
    c=>c.id===campaignId
    );








    if(!campaign)
    return;








    const preview =
    buildAdMessage(
    campaign
    );









    openGlobalModal(`





    <h3>

    معاينة الإعلان

    </h3>





    <div class="ad-preview">



    <p>

    ${preview.text}

    </p>



    <a class="telegram-ad-button">


    ${TelegramBotLayer.buttonText}


    </a>



    </div>






    `);







}









// ===============================
// Bot Events
// ===============================







function onBotConnected(){






    console.log(

    "Telegram Bot Layer Ready 🚀"

    );







}












// ===============================
// Bot API Sync
// ===============================







async function syncBot(){





    return await API.request(



    "/telegram/status",



    {


        method:"GET"



    }



    );






}









// Initialize Bot Layer


setTimeout(()=>{



    onBotConnected();



},1200);

/* =====================================================
   Telega.ads Mini App
   app.js - Part 8
   Final Controller + App Launch
====================================================== */







// ===============================
// Global Modal System
// ===============================







function openGlobalModal(content){





    const old =
    document.querySelector(
    ".modal"
    );






    if(old)
    old.remove();









    const modal =
    document.createElement(
    "div"
    );







    modal.className =
    "modal";








    modal.innerHTML = `





    <div class="modal-content">



        <button
        class="close-modal"
        onclick="closeGlobalModal()">

        ✕


        </button>




        ${content}





    </div>






    `;







    document.body
    .appendChild(
    modal
    );






}









function closeGlobalModal(){





    const modal =
    document.querySelector(
    ".modal"
    );







    if(modal)
    modal.remove();







}









// ===============================
// Application Router
// ===============================







const Router = {





    routes:{},






    register(
    name,
    callback
    ){



        this.routes[name] =
        callback;



    },







    go(name){



        if(
        this.routes[name]
        ){



            this.routes[name]();



        }



    }








};











// ===============================
// Register Pages
// ===============================







Router.register(

"dashboard",

()=>{


openDashboard();


}

);








Router.register(

"publisher",

()=>{


if(
canAccess("publisher")
)

openPage(
"publisherSection"
);


}

);








Router.register(

"advertiser",

()=>{


if(
canAccess("advertiser")
)

openPage(
"advertiserSection"
);


}

);








Router.register(

"wallet",

()=>{


openPage(
"walletSection"
);


}

);








Router.register(

"admin",

()=>{


if(
checkAdmin()
)

openPage(
"adminSection"
);


}

);












// ===============================
// Navigation Events
// ===============================







function setupNavigation(){





    document
    .querySelectorAll(
    "[data-page]"
    )
    .forEach(button=>{







        button.addEventListener(
        "click",
        ()=>{





            Router.go(
            button
            .dataset
            .page
            );






        }

        );






    });







}











// ===============================
// Global Error Handler
// ===============================







window.addEventListener(
"error",
event=>{





    console.log(
    "App Error:",
    event.message
    );





});









// ===============================
// Network Check
// ===============================







function checkConnection(){





    if(
    navigator.onLine
    ){



        return true;



    }








    showNotification(
    "لا يوجد اتصال بالإنترنت"
    );








    return false;






}












// ===============================
// App Security
// ===============================







function securityCheck(){





    if(
    AppState.user.banned
    ){





        showNotification(
        "الحساب موقوف"
        );




        return false;




    }







    return true;







}












// ===============================
// Full Application Start
// ===============================







async function startApplication(){






    try{





        checkConnection();





        securityCheck();





        authenticateTelegram();





        setupNavigation();





        renderChannels();





        renderCampaigns();





        renderTransactions();





        renderAdminUsers();





        updateWallet();







        AppState.app.initialized =
        true;







        Storage.save();







        console.log(

        `

        =====================
        Telega.ads Started 🚀
        Version 1.0.0
        =====================

        `

        );







    }

    catch(error){






        console.log(
        "Startup Error",
        error
        );







    }







}











// ===============================
// Wallet UI Update
// ===============================







function updateWallet(){





    const balance =
    document.getElementById(
    "walletBalance"
    );








    if(balance){





        balance.innerText =

        getBalance()

        +

        " USDT";






    }







}












// ===============================
// Auto Start
// ===============================







if(
document.readyState
===
"loading"
)

{



    document.addEventListener(
    "DOMContentLoaded",
    startApplication
    );



}

else{



    startApplication();



}











// ===============================
// Developer API
// ===============================







window.TelegaAds = {




    state:
    AppState,



    router:
    Router,



    storage:
    Storage,



    api:
    API,



    bot:
    TelegramBotLayer




};







/* =====================================================

   Telega.ads app.js COMPLETED 🚀


   Includes:

   ✔ Telegram WebApp
   ✔ Users
   ✔ Publisher
   ✔ Advertiser
   ✔ Wallet
   ✔ Admin
   ✔ Bot Layer
   ✔ Router
   ✔ Storage


===================================================== */

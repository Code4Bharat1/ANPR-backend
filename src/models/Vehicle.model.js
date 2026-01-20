import mongoose from "mongoose";

const vehicleSchema = new mongoose.Schema(
    {
        /* ==============================
           BASIC VEHICLE INFO
        ============================== */
        vehicleNumber: {
            type: String,
            required: true,
            uppercase: true,
            trim: true,
            index: true,
        },

        vehicleType: {
            type: String,
            enum: [
                // 🚛 Heavy Commercial Vehicles
                "TRUCK_12_WHEEL",
                "TRUCK_10_WHEEL",
                "TRUCK_6_WHEEL",
                "TRAILER",
                "DUMPER",
                "TIPPER",

                // 🚚 Medium / Light Commercial
                "PICKUP",
                "LCV",
                "VAN",

                // 🛢️ Special Purpose
                "TANKER",
                "CRANE",
                "BULKER",
                "CONCRETE_MIXER",

                // 🚜 Construction / Site Vehicles
                "EXCAVATOR",
                "JCB",
                "BULLDOZER",
                "ROLLER",
                "FORKLIFT",

                // 🚗 Passenger / Staff
                "CAR",
                "BIKE",
                "BUS",
                "VISITOR",

                // ❓ Others
                "OTHER"
            ],
            required: true
        },

    /* ==============================
       RELATIONS
    ============================== */
    clientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Client",
            required: true,
        },

        siteId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Site",
            required: true,
        },

        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vendor",
            required: false,
        },

        /* ==============================
           DRIVER INFO
        ============================== */
        driverName: {
            type: String,
            trim: true,
        },

        driverPhone: {
            type: String,
            trim: true,
        },

        /* ==============================
           STATUS FLAGS
        ============================== */
        isInside: {
            type: Boolean,
            default: false, // INSIDE / OUTSIDE
        },

        isBlacklisted: {
            type: Boolean,
            default: false,
        },

        lastEntryAt: {
            type: Date,
        },

        lastExitAt: {
            type: Date,
        },

        /* ==============================
           ANPR DETAILS
        ============================== */
        lastAnprImage: {
            type: String, // URL / base64
            default: "",
        },

        lastDetectedAt: {
            type: Date,
        },

        /* ==============================
           AUDIT
        ============================== */
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    },
    {
        timestamps: true,
    }
);

/* ==============================
   INDEXES
============================== */
vehicleSchema.index({ vehicleNumber: 1, siteId: 1 });

export default mongoose.model("Vehicle", vehicleSchema);

import {NextResponse} from "next/server";
export async function POST(){return NextResponse.json({error:"Investment profits cannot be withdrawn directly. Exit the position and withdraw the settled Available Balance."},{status:410});}

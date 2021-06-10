use sudograph::graphql_database;
// use ic_cdk::api::caller;

graphql_database!("canisters/graphql/src/schema.graphql");

#[update]
async fn graphql_mutation_custom(mutation_string: String, variables_json_string: String) -> String {
    // TODO I need to update sudograph to allow turning off the generated graphql_mutation function
    // TODO I also need to be able to update the playground with custom query and mutation function names
    // if sudograph::ic_cdk::caller().to_text() != "" {
    //     panic!("Not authorized");
    // }

    // TODO I think this cross-canister call is making the mutations take forever
    // TODO once the async types are fixed in ic_cdk, update and we should be able to move the randomness into the
    // TODO create resolver itself, so only it will need to do this call and take forever to do so
    let call_result: Result<(Vec<u8>,), _> = sudograph::ic_cdk::api::call::call(ic_cdk::export::Principal::management_canister(), "raw_rand", ()).await;

    if let Ok(result) = call_result {
        let rand_store = storage::get_mut::<RandStore>();

        let randomness = result.0;

        let mut rng: StdRng = SeedableRng::from_seed(randomness_vector_to_array(randomness));

        rand_store.insert(String::from("RNG"), rng);
    }

    // TODO figure out how to create global variable to store the schema in
    let schema = Schema::new(
        QueryGenerated,
        MutationGenerated,
        EmptySubscription
    );

    ic_print("graphql_mutation");

    let request = Request::new(mutation_string).variables(Variables::from_json(sudograph::serde_json::from_str(&variables_json_string).expect("This should work")));

    let response = schema.execute(request).await;

    let json_result = to_json_string(&response);

    return json_result.expect("This should work");
}